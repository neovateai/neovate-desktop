import type { PermissionResult, PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ClaudeCodeUIEventRequest } from "../../../../../shared/claude-code/types";
import type { PermissionMode } from "../../../../../shared/features/agent/types";

import { CodeBlock } from "../../../components/ai-elements/code-block";
import { Kbd } from "../../../components/ui/kbd";
import { cn } from "../../../lib/utils";
import {
  formatSuggestionLabel,
  formatToolPreview,
  getSuggestionPersistencePath,
  inferDecisionReason,
} from "./permission-utils";

type Props = {
  request: ClaudeCodeUIEventRequest;
  pendingCount: number;
  pendingIndex: number;
  permissionMode: PermissionMode;
  onResolve: (result: PermissionResult) => void;
};

type OptionValue = "yes" | "yes-always" | "no" | "no-feedback";

export function PermissionRequestDialog({
  request,
  pendingCount,
  pendingIndex,
  permissionMode,
  onResolve,
}: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLInputElement>(null);
  const [feedbackExpanded, setFeedbackExpanded] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const suggestions = request.options.suggestions;
  const hasSuggestions = suggestions && suggestions.length > 0;

  // ─── Tool preview ──────────────────────────────────────────────────────
  const preview = formatToolPreview(request.toolName, request.input as Record<string, unknown>);

  // ─── Decision reason ───────────────────────────────────────────────────
  const reason = inferDecisionReason(permissionMode, request.options);

  // ─── Suggestion label & persistence ────────────────────────────────────
  const suggestionLabel = hasSuggestions ? formatSuggestionLabel(suggestions) : null;
  const persistencePath = hasSuggestions ? getSuggestionPersistencePath(suggestions) : null;

  // ─── Actions ───────────────────────────────────────────────────────────
  const handleAllow = useCallback(() => {
    onResolve({ behavior: "allow" });
  }, [onResolve]);

  const handleAlwaysAllow = useCallback(() => {
    if (!suggestions) return;
    onResolve({
      behavior: "allow",
      updatedPermissions: suggestions as PermissionUpdate[],
    });
  }, [onResolve, suggestions]);

  const handleDeny = useCallback(
    (message?: string) => {
      onResolve({
        behavior: "deny",
        message: message || "User denied",
      });
    },
    [onResolve],
  );

  const handleOptionClick = useCallback(
    (value: OptionValue) => {
      switch (value) {
        case "yes":
          handleAllow();
          break;
        case "yes-always":
          handleAlwaysAllow();
          break;
        case "no":
          handleDeny();
          break;
        case "no-feedback":
          setFeedbackExpanded(true);
          break;
      }
    },
    [handleAllow, handleAlwaysAllow, handleDeny],
  );

  const handleFeedbackSubmit = useCallback(() => {
    const text = feedbackText.trim();
    handleDeny(text || undefined);
  }, [feedbackText, handleDeny]);

  // ─── Focus management ─────────────────────────────────────────────────
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (feedbackExpanded) {
      feedbackRef.current?.focus();
    }
  }, [feedbackExpanded]);

  // ─── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      if (e.key === "Escape") {
        e.preventDefault();
        if (feedbackExpanded) {
          setFeedbackExpanded(false);
          containerRef.current?.focus();
        } else {
          handleDeny();
        }
        return;
      }

      if (isInputFocused) {
        if (e.key === "Enter" && feedbackExpanded) {
          e.preventDefault();
          handleFeedbackSubmit();
        }
        return;
      }

      switch (e.key) {
        case "y":
          e.preventDefault();
          handleAllow();
          break;
        case "a":
          if (hasSuggestions) {
            e.preventDefault();
            handleAlwaysAllow();
          }
          break;
        case "n":
          e.preventDefault();
          handleDeny();
          break;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    feedbackExpanded,
    hasSuggestions,
    handleAllow,
    handleAlwaysAllow,
    handleDeny,
    handleFeedbackSubmit,
  ]);

  // ─── Build options ─────────────────────────────────────────────────────
  const allowLabel = hasSuggestions ? t("permission.allowOnce") : t("permission.allow");

  const options: {
    value: OptionValue;
    label: string;
    shortcut?: string;
    subtitle?: string;
  }[] = [
    { value: "yes", label: allowLabel, shortcut: "y" },
    ...(hasSuggestions && suggestionLabel
      ? [
          {
            value: "yes-always" as const,
            label: `${t("permission.allow")}, ${suggestionLabel}`,
            shortcut: "a",
            subtitle: persistencePath
              ? t("permission.savesTo", { path: persistencePath })
              : undefined,
          },
        ]
      : []),
    { value: "no", label: t("permission.deny"), shortcut: "n" },
    { value: "no-feedback", label: t("permission.denyFeedback") },
  ];

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="relative min-w-0 max-w-full bg-background-secondary px-4 py-3 outline-none"
    >
      {/* Header: Tool name + pending count */}
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <p className="truncate text-sm font-medium">{preview.title}</p>
        {pendingCount > 1 && (
          <span className="text-xs text-muted-foreground">
            ({t("permission.pendingCount", { current: pendingIndex + 1, total: pendingCount })})
          </span>
        )}
      </div>

      {/* Tool preview */}
      {preview.code && preview.language && (
        <div className="mb-2 min-w-0 max-w-full max-h-24 overflow-auto rounded">
          <CodeBlock code={preview.code} language={preview.language} className="text-sm" />
        </div>
      )}
      {preview.code && !preview.language && (
        <pre className="mb-2 min-w-0 max-w-full max-h-24 overflow-auto rounded bg-muted/50 p-2 text-xs">
          {preview.code}
        </pre>
      )}
      {preview.subtitle && !preview.code && (
        <p className="mb-2 truncate text-sm text-muted-foreground">{preview.subtitle}</p>
      )}

      {/* Decision reason */}
      <p className="mb-3 min-w-0 break-all text-xs text-muted-foreground">
        <span className="mr-1">&#x23BF;</span>
        {reason}
      </p>

      {/* Options */}
      <div className="space-y-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
              "hover:bg-muted/80 active:bg-muted focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
              option.value === "no-feedback" && feedbackExpanded && "bg-muted/50",
            )}
            onClick={() => handleOptionClick(option.value)}
          >
            <div className="min-w-0">
              <span className="block truncate">{option.label}</span>
              {option.subtitle && (
                <span className="block text-xs text-muted-foreground">{option.subtitle}</span>
              )}
            </div>
            {option.shortcut && <Kbd className="ml-2 shrink-0">{option.shortcut}</Kbd>}
          </button>
        ))}
      </div>

      {/* Feedback input */}
      {feedbackExpanded && (
        <div className="mt-1.5 pl-3">
          <input
            ref={feedbackRef}
            type="text"
            className="w-full rounded-md border border-border/70 bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 ring-ring focus:ring-1"
            placeholder={t("permission.feedbackPlaceholder")}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
          />
        </div>
      )}

      {/* Footer hint */}
      <div className="mt-3 flex justify-end">
        <span className="text-xs text-muted-foreground">
          <Kbd>Esc</Kbd>
        </span>
      </div>
    </div>
  );
}
