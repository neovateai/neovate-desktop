import debug from "debug";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  Save,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ResolvedReference } from "../../../../../../shared/features/rules/contract";

import { Button } from "../../../../components/ui/button";
import { Spinner } from "../../../../components/ui/spinner";
import { client } from "../../../../orpc";
import { useSettingsStore } from "../../store";

const log = debug("neovate:settings:rules");

const POLL_INTERVAL_MS = 2000;
const DEBOUNCE_MS = 500;

export const RulesPanel = () => {
  const { t } = useTranslation();
  const setTabChangeGuard = useSettingsStore((s) => s.setTabChangeGuard);

  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [filePath, setFilePath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [externalChangePrompt, setExternalChangePrompt] = useState(false);

  const [references, setReferences] = useState<ResolvedReference[]>([]);
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set());

  const lastMtimeRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const isDirty = content !== savedContent;

  // Parse @file references from content
  const parsedFilenames = useMemo(() => {
    const matches: string[] = [];
    for (const line of content.split("\n")) {
      const match = line.match(/^@(\S+)\s*$/);
      if (match) matches.push(match[1]);
    }
    return matches;
  }, [content]);

  // Resolve references (debounced)
  useEffect(() => {
    if (parsedFilenames.length === 0) {
      setReferences([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await client.rules.resolveReferences({ filenames: parsedFilenames });
        setReferences(result.references);
        log("resolved references count=%d", result.references.length);
      } catch (e) {
        log("failed to resolve references: %O", e);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [parsedFilenames]);

  const toggleRefExpanded = (filename: string) => {
    setExpandedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  // Load content on mount
  const loadContent = useCallback(async () => {
    try {
      const result = await client.rules.readGlobal();
      log("loaded global rules length=%d", result.content.length);
      setContent(result.content);
      setSavedContent(result.content);
      setFilePath(result.path);

      const { mtime } = await client.rules.watchGlobal();
      lastMtimeRef.current = mtime;
    } catch (e) {
      log("failed to load global rules: %O", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  // Poll for external changes
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { mtime } = await client.rules.watchGlobal();
        if (mtime > 0 && mtime !== lastMtimeRef.current) {
          log("external change detected mtime=%d prev=%d", mtime, lastMtimeRef.current);
          lastMtimeRef.current = mtime;

          if (isDirty) {
            setExternalChangePrompt(true);
          } else {
            const result = await client.rules.readGlobal();
            setContent(result.content);
            setSavedContent(result.content);
          }
        }
      } catch {
        // Polling failure is non-critical
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isDirty]);

  // Tab change guard
  useEffect(() => {
    if (isDirty) {
      setTabChangeGuard(() => {
        return window.confirm(t("settings.rules.unsavedChanges"));
      });
    } else {
      setTabChangeGuard(null);
    }
    return () => setTabChangeGuard(null);
  }, [isDirty, setTabChangeGuard, t]);

  // Cmd+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDirty, content]);

  const handleSave = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      await client.rules.writeGlobal({ content });
      setSavedContent(content);

      const { mtime } = await client.rules.watchGlobal();
      lastMtimeRef.current = mtime;

      log("saved global rules length=%d", content.length);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch (e) {
      log("failed to save global rules: %O", e);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await client.rules.openFolder();
    } catch (e) {
      log("failed to open folder: %O", e);
    }
  };

  const handleReloadExternal = async () => {
    setExternalChangePrompt(false);
    const result = await client.rules.readGlobal();
    setContent(result.content);
    setSavedContent(result.content);
  };

  const handleKeepEditing = () => {
    setExternalChangePrompt(false);
  };

  // Tab key inserts 2 spaces
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = content.substring(0, start) + "  " + content.substring(end);
      setContent(newValue);
      // Restore cursor position after React re-render
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <h1 className="text-xl font-semibold mb-8 flex items-center gap-3 text-foreground">
        <span className="flex items-center justify-center size-9 rounded-xl bg-primary/10">
          <BookOpen className="size-5 text-primary" />
        </span>
        {t("settings.rules")}
      </h1>

      {/* Section header with actions */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-sm font-medium text-foreground">{t("settings.rules.globalRules")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{filePath}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleOpenFolder}>
            <FolderOpen className="size-3.5" />
            {t("settings.rules.openFolder")}
          </Button>
          <Button
            variant={showSaved ? "outline" : "default"}
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || saving}
          >
            {showSaved ? (
              <>
                <Check className="size-3.5" />
                {t("settings.rules.saved")}
              </>
            ) : (
              <>
                <Save className="size-3.5" />
                {t("settings.rules.save")}
                {isDirty && <span className="ml-1 size-1.5 rounded-full bg-current inline-block" />}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Editor Container */}
      <div className="rounded-xl bg-muted/30 border border-border/50 overflow-hidden">
        {/* Description */}
        <p className="text-xs text-muted-foreground px-4 pt-3 pb-2">
          {t("settings.rules.globalRules.description")}
        </p>

        {/* Editor */}
        <textarea
          ref={textareaRef}
          className="w-full border-0 bg-transparent px-4 py-3 text-sm font-mono text-foreground ring-ring/24 transition-all focus:ring-0 focus:outline-none resize-none"
          style={{
            minHeight: "200px",
            maxHeight: "60vh",
            fieldSizing: "content",
          }}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("settings.rules.placeholder")}
          aria-label={t("settings.rules.globalRules")}
          spellCheck={false}
        />
      </div>

      {/* External change prompt */}
      {externalChangePrompt && (
        <div className="mt-4 p-4 rounded-xl border border-border/50 bg-muted/30">
          <p className="text-sm text-foreground mb-3">
            {t("settings.rules.fileChangedExternally")}
          </p>
          <div className="flex gap-2">
            <Button variant="default" size="sm" onClick={handleReloadExternal}>
              {t("settings.rules.reload")}
            </Button>
            <Button variant="outline" size="sm" onClick={handleKeepEditing}>
              {t("settings.rules.keepEditing")}
            </Button>
          </div>
        </div>
      )}

      {/* Referenced files */}
      {references.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            {t("settings.rules.referencedFiles", { count: references.length })}
          </h3>
          <div className="rounded-xl bg-muted/30 border border-border/50 overflow-hidden divide-y divide-border/40">
            {references.map((ref) => (
              <div key={ref.filename}>
                <button
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-left cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() => ref.exists && toggleRefExpanded(ref.filename)}
                  disabled={!ref.exists}
                >
                  {ref.exists ? (
                    expandedRefs.has(ref.filename) ? (
                      <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                    )
                  ) : (
                    <AlertTriangle className="size-3.5 text-destructive shrink-0" />
                  )}
                  <FileText className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground">{ref.filename}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {ref.exists
                      ? t("settings.rules.lines", { count: ref.lineCount })
                      : t("settings.rules.notFound")}
                  </span>
                </button>
                {ref.exists && expandedRefs.has(ref.filename) && (
                  <div className="border-t border-border/40 bg-background/50">
                    <pre className="px-4 py-3 text-xs font-mono text-muted-foreground overflow-auto max-h-64 whitespace-pre-wrap">
                      {ref.content}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
