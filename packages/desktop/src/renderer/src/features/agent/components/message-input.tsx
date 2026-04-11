import Placeholder from "@tiptap/extension-placeholder";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Extension, useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import debug from "debug";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ImageAttachment, PermissionMode } from "../../../../../shared/features/agent/types";

import { toastManager } from "../../../components/ui/toast";
import { useEventCallback } from "../../../hooks/use-event-callback";
import { useLatestRef } from "../../../hooks/use-latest-ref";
import { cn } from "../../../lib/utils";
import { useConfigStore } from "../../config/store";
import { useSettingsStore } from "../../settings";
import { claudeCodeChatManager } from "../chat-manager";
import { useNewSession } from "../hooks/use-new-session";
import { useAgentStore } from "../store";
import { extractText } from "../utils/extract-text";
import { buildInsertChatContent, type InsertChatDetail } from "../utils/insert-chat";
import { readFileAsAttachment } from "../utils/read-file-as-attachment";
import { AttachmentPreview } from "./attachment-preview";
import { GradientBorderWrapper } from "./gradient-border-wrapper";
import { createImagePasteExtension } from "./image-paste-extension";
import { InputToolbar } from "./input-toolbar";
import { ChatLink } from "./link-extension";
import { createMentionExtension } from "./mention-extension";
import { QueryStatus } from "./query-status";
import { createSlashCommandsExtension } from "./slash-commands-extension";

const log = debug("neovate:message-input");

type Props = {
  onSend: (message: string, attachments?: ImageAttachment[]) => void;
  onCancel: () => void;
  streaming: boolean;
  disabled?: boolean;
  sessionInitializing?: boolean;
  sessionInitError?: string | null;
  onRetry?: () => void;
  cwd: string;
  dockAttached?: boolean;
  /** Show project selector in toolbar (popup window mode) */
  showProjectSelector?: boolean;
};

const NEW_CHAT_EASTER_EGGS = new Set(["exit", "quit", ":q", ":q!", ":wq", ":wq!"]);

type SessionDraft = {
  content: JSONContent;
  attachments: ImageAttachment[];
};

const sessionDrafts = new Map<string, SessionDraft>();

export function MessageInput({
  onSend,
  onCancel,
  streaming,
  disabled,
  sessionInitializing,
  sessionInitError,
  onRetry,
  cwd,
  dockAttached = false,
  showProjectSelector = false,
}: Props) {
  const { t } = useTranslation();
  const cwdRef = useLatestRef(cwd);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorJsonRef = useRef<JSONContent | null>(null);
  const { createNewSession } = useNewSession();

  const activeSessionId = useAgentStore((s) => s.activeSessionId);

  // Subscribe to prompt suggestion from the per-session chat store.
  // Uses useState+useEffect instead of useStore to avoid conditional hook calls
  // (chatStore may be undefined when no session is active).
  const [promptSuggestion, setPromptSuggestion] = useState<string | null>(null);
  useEffect(() => {
    const store = activeSessionId
      ? claudeCodeChatManager.getChat(activeSessionId)?.store
      : undefined;
    if (!store) {
      setPromptSuggestion(null);
      return;
    }
    setPromptSuggestion(store.getState().promptSuggestion);
    return store.subscribe((state) => {
      setPromptSuggestion(state.promptSuggestion);
    });
  }, [activeSessionId]);
  const promptSuggestionRef = useLatestRef(promptSuggestion);

  const clearSuggestion = useEventCallback(() => {
    if (!activeSessionId) return;
    claudeCodeChatManager.getChat(activeSessionId)?.store.setState({ promptSuggestion: null });
  });

  const permissionMode = useAgentStore(
    (s) =>
      (activeSessionId ? s.sessions.get(activeSessionId)?.permissionMode : undefined) ?? "default",
  );
  const setPermissionMode = useAgentStore((s) => s.setPermissionMode);

  const togglePlanMode = useEventCallback(() => {
    if (!activeSessionId) return;
    const current =
      useAgentStore.getState().sessions.get(activeSessionId)?.permissionMode ?? "default";
    const configDefault = useConfigStore.getState().permissionMode as PermissionMode;
    const next: PermissionMode = current === "plan" ? configDefault : "plan";
    log("togglePlanMode: %s -> %s (configDefault=%s)", current, next, configDefault);
    setPermissionMode(activeSessionId, next);
    claudeCodeChatManager.getChat(activeSessionId)?.dispatch({
      kind: "configure",
      configure: { type: "set_permission_mode", mode: next },
    });
  });

  const [attachments, setAttachments] = useState<ImageAttachment[]>(() =>
    activeSessionId ? (sessionDrafts.get(activeSessionId)?.attachments ?? []) : [],
  );
  const attachmentsRef = useLatestRef(attachments);

  const addAttachments = useCallback((images: ImageAttachment[]) => {
    log(
      "addAttachments: adding %d images, ids=%o",
      images.length,
      images.map((i) => i.id),
    );
    setAttachments((prev) => {
      const next = [...prev, ...images];
      log("addAttachments: total attachments now=%d", next.length);
      return next;
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const sendMessageWith = useConfigStore((s) => s.sendMessageWith);
  const sendMessageWithRef = useLatestRef(sendMessageWith);

  const mentionExtension = useMemo(() => createMentionExtension(() => cwdRef.current), []);

  const slashCommandsExtension = useMemo(
    () =>
      createSlashCommandsExtension(() => {
        const { activeSessionId, sessions } = useAgentStore.getState();
        if (!activeSessionId) return [];
        return sessions.get(activeSessionId)?.availableCommands ?? [];
      }),
    [],
  );

  const imagePasteExtension = useMemo(
    () => createImagePasteExtension(addAttachments),
    [addAttachments],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        bold: false,
        italic: false,
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
        link: false, // Use custom ChatLink instead
      }),
      Placeholder.configure({
        placeholder: () => {
          const suggestion = promptSuggestionRef.current;
          if (suggestion) return suggestion + "    Tab to fill · Enter to send";
          return t("chat.placeholder");
        },
      }),
      mentionExtension,
      slashCommandsExtension,
      imagePasteExtension,
      ChatLink,
      Extension.create({
        name: "chatKeymap",
        addProseMirrorPlugins() {
          const editor = this.editor;
          return [
            new Plugin({
              key: new PluginKey("chatKeymap"),
              props: {
                handleKeyDown(_view, event) {
                  const mode = sendMessageWithRef.current;

                  // Tab: accept prompt suggestion (fill editor)
                  if (event.key === "Tab" && !event.shiftKey) {
                    if (document.querySelector("[data-suggestion-popup]")) return false;
                    const suggestion = promptSuggestionRef.current;
                    if (suggestion && editor.isEmpty) {
                      event.preventDefault();
                      editor.commands.setContent(suggestion);
                      clearSuggestion();
                      return true;
                    }
                    return false;
                  }

                  // Bare Enter (no modifier)
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.altKey &&
                    !event.metaKey &&
                    !event.ctrlKey
                  ) {
                    if (document.querySelector("[data-suggestion-popup]")) return false;

                    if (mode === "cmdEnter") {
                      return false;
                    }

                    event.preventDefault();
                    const text = extractText(editor.getJSON()).trim();

                    // Empty input + suggestion → send suggestion directly
                    const suggestion = promptSuggestionRef.current;
                    if (!text && suggestion) {
                      clearSuggestion();
                      onSend(suggestion);
                      toastManager.add({
                        type: "info",
                        title: t("chat.suggestionSent"),
                        timeout: 2000,
                      });
                      return true;
                    }

                    if (NEW_CHAT_EASTER_EGGS.has(text.toLowerCase())) {
                      editor.commands.clearContent();
                      createNewSession(cwdRef.current);
                      return true;
                    }
                    send();
                    return true;
                  }
                  // Cmd/Ctrl+Enter
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    if (document.querySelector("[data-suggestion-popup]")) return false;

                    if (mode === "cmdEnter") {
                      event.preventDefault();
                      const text = extractText(editor.getJSON()).trim();

                      // Empty input + suggestion → send suggestion directly
                      const suggestion = promptSuggestionRef.current;
                      if (!text && suggestion) {
                        clearSuggestion();
                        onSend(suggestion);
                        toastManager.add({
                          type: "info",
                          title: t("chat.suggestionSent"),
                          timeout: 2000,
                        });
                        return true;
                      }

                      if (NEW_CHAT_EASTER_EGGS.has(text.toLowerCase())) {
                        editor.commands.clearContent();
                        createNewSession(cwdRef.current);
                        return true;
                      }
                      send();
                      return true;
                    }

                    editor.commands.setHardBreak();
                    return true;
                  }
                  if (event.key === "Enter" && event.altKey) {
                    editor.commands.setHardBreak();
                    return true;
                  }
                  if (event.key === "Tab" && event.shiftKey) {
                    event.preventDefault();
                    togglePlanMode();
                    return true;
                  }
                  if (event.key === "Escape") {
                    // Dismiss suggestion first, then blur on next Escape
                    if (promptSuggestionRef.current) {
                      clearSuggestion();
                      return true;
                    }
                    editor.commands.blur();
                    return true;
                  }
                  return false;
                },
              },
            }),
          ];
        },
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "tiptap min-h-[76px] max-h-[240px] overflow-y-auto px-3 py-2 text-sm outline-none bg-background-secondary",
      },
      transformPastedHTML(html) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const parts: string[] = [];

        const blockElements = new Set([
          "p",
          "div",
          "section",
          "article",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "li",
          "tr",
          "blockquote",
          "pre",
        ]);

        // 列表缩进空格数
        const INDENT_SIZE = 2;

        function isValidUrl(str: string): boolean {
          try {
            const url = new URL(str);
            return ["http:", "https:", "ftp:"].includes(url.protocol);
          } catch {
            return false;
          }
        }

        function escapeHtml(text: string): string {
          return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
        }

        // 跟踪有序列表的序号
        const olCounters: number[] = [];

        function walk(node: Node, listDepth: number): void {
          if (node.nodeType === Node.TEXT_NODE) {
            // 保留文本节点中的所有空白（包括缩进）
            const text = node.textContent || "";
            if (text) parts.push(escapeHtml(text));
            return;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          const el = node as Element;
          const tagName = el.tagName.toLowerCase();

          // 处理链接：提取 href 而非文本内容
          if (tagName === "a") {
            const href = el.getAttribute("href");
            if (href && isValidUrl(href)) {
              parts.push(href);
              return;
            }
          }

          // 处理换行元素
          if (tagName === "br") {
            parts.push("\n");
            return;
          }

          // 处理无序列表开始
          if (tagName === "ul") {
            // 递归遍历子节点，增加列表深度
            for (const child of Array.from(el.childNodes)) {
              walk(child, listDepth + 1);
            }
            return;
          }

          // 处理有序列表开始
          if (tagName === "ol") {
            olCounters.push(1);
            for (const child of Array.from(el.childNodes)) {
              walk(child, listDepth + 1);
            }
            olCounters.pop();
            return;
          }

          // 处理列表项：添加缩进和前缀
          if (tagName === "li") {
            // 使用 \u00A0 (non-breaking space) 确保缩进在 HTML 中显示
            const indent = "\u00A0".repeat(Math.max(0, listDepth - 1) * INDENT_SIZE);
            const isOl = olCounters.length > 0;

            if (isOl) {
              const counter = olCounters[olCounters.length - 1];
              parts.push(`${indent}${counter}. `);
              olCounters[olCounters.length - 1] = counter + 1;
            } else {
              parts.push(`${indent}- `);
            }

            // 遍历子节点（不增加深度，因为 li 本身就是一层）
            for (const child of Array.from(el.childNodes)) {
              walk(child, listDepth);
            }
            parts.push("\n");
            return;
          }

          // 递归遍历子节点
          for (const child of Array.from(el.childNodes)) {
            walk(child, listDepth);
          }

          // 块级元素后添加换行
          if (blockElements.has(tagName)) {
            parts.push("\n");
          }
        }

        walk(doc.body, 0);

        // 合并并转换为段落结构
        // 使用 white-space: pre-wrap 保留前导空格（缩进）
        const text = parts.join("");
        return text
          .split("\n")
          .map((line) => {
            if (!line) return "<p></p>";
            return `<p style="white-space: pre-wrap;">${line}</p>`;
          })
          .join("");
      },
    },
    editable: !disabled,
    autofocus: "end",
    content: activeSessionId ? sessionDrafts.get(activeSessionId)?.content : undefined,
    onCreate: ({ editor: e }) => {
      editorJsonRef.current = e.getJSON();
    },
    onUpdate: ({ editor: e }) => {
      editorJsonRef.current = e.getJSON();
    },
  });

  const send = useEventCallback(() => {
    if (!editor || streaming) return;
    const text = extractText(editor.getJSON());
    const imgs = attachmentsRef.current;
    log(
      "send: text=%s attachmentsRef.current.length=%d ids=%o",
      text.slice(0, 50),
      imgs.length,
      imgs.map((i) => i.id),
    );
    if (imgs.length > 0) {
      log(
        "send: attachment details: %o",
        imgs.map((i) => ({
          id: i.id,
          filename: i.filename,
          mediaType: i.mediaType,
          base64Len: i.base64?.length ?? 0,
        })),
      );
    }
    if (!text && imgs.length === 0) return;
    onSend(text, imgs.length > 0 ? imgs : undefined);
    editor.commands.clearContent();
    setAttachments([]);
    if (activeSessionId) sessionDrafts.delete(activeSessionId);
  });

  // Keep editable in sync with props
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // Save draft on unmount so it persists across session switches
  useEffect(() => {
    return () => {
      if (!activeSessionId) return;
      const json = editorJsonRef.current;
      if (!json) return;
      const imgs = attachmentsRef.current;
      if (extractText(json).trim() || imgs.length > 0) {
        sessionDrafts.set(activeSessionId, { content: json, attachments: imgs });
      } else {
        sessionDrafts.delete(activeSessionId);
      }
    };
  }, [activeSessionId]);

  // Restore draft when session switches without remount (e.g., between new sessions in welcome panel)
  const prevSessionIdRef = useRef(activeSessionId);
  useEffect(() => {
    if (prevSessionIdRef.current === activeSessionId) return;
    prevSessionIdRef.current = activeSessionId;
    if (!editor || editor.isDestroyed) return;
    const draft = activeSessionId ? sessionDrafts.get(activeSessionId) : undefined;
    if (draft) {
      editor.commands.setContent(draft.content);
      setAttachments(draft.attachments);
    } else {
      editor.commands.clearContent();
      setAttachments([]);
    }
  }, [editor, activeSessionId]);

  // Force placeholder re-render when suggestion changes
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta("promptSuggestion", promptSuggestion));
    // Focus input so Tab/Enter work immediately on the suggestion.
    // Guard with document.hasFocus() because MessageInput is used in both
    // the main window and popup window (shared activeSessionId) — without
    // this, both windows would try to steal focus simultaneously.
    if (promptSuggestion && document.hasFocus()) {
      requestAnimationFrame(() => {
        editor.commands.focus("end");
      });
    }
  }, [editor, promptSuggestion]);

  // Close suggestion popups when settings opens
  const showSettings = useSettingsStore((s) => s.showSettings);
  useEffect(() => {
    if (showSettings) {
      document.querySelectorAll("[data-suggestion-popup]").forEach((el) => el.remove());
    }
  }, [showSettings]);

  // Focus editor when project is switched
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      editor.commands.focus("end");
    };
    window.addEventListener("neovate:focus-input", handler);
    return () => window.removeEventListener("neovate:focus-input", handler);
  }, [editor]);

  // Listen for insert-chat events from file tree and other entry points
  useEffect(() => {
    if (!editor) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<InsertChatDetail>).detail ?? {};
      const content = buildInsertChatContent(detail);
      log(
        "insert-chat received textLen=%d mentions=%d",
        detail.text?.length ?? 0,
        detail.mentions?.length ?? 0,
      );
      if (content.length === 0) return;
      editor.chain().focus().insertContent(content).run();
    };
    window.addEventListener("neovate:insert-chat", handler);
    return () => window.removeEventListener("neovate:insert-chat", handler);
  }, [editor]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      log("handleFileSelect: files=%d", files?.length ?? 0);
      if (!files || files.length === 0) return;
      const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
      log("handleFileSelect: imageFiles=%d", imageFiles.length);
      if (imageFiles.length === 0) return;
      Promise.all(imageFiles.map(readFileAsAttachment)).then(addAttachments);
      e.target.value = "";
    },
    [addAttachments],
  );
  return (
    <div className={cn("px-4 pt-4 pb-1 max-w-3xl mx-auto w-full", dockAttached ? "pb-1 pt-0" : "")}>
      {activeSessionId && <QueryStatus sessionId={activeSessionId} />}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label={t("chat.attachImages")}
        onChange={handleFileSelect}
      />
      <GradientBorderWrapper
        innerClassName={cn(
          "focus-within:!border-primary/50",
          dockAttached ? "rounded-b-lg rounded-t-[18px]" : "rounded-lg",
        )}
      >
        <AnimatePresence>
          {permissionMode === "plan" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div
                className={cn(
                  "flex items-center gap-1.5 border-b border-info/20 bg-info/5 px-3 py-1 text-xs text-info-foreground",
                  dockAttached ? "rounded-t-[18px]" : "rounded-t-lg",
                )}
              >
                <span className="font-medium">{t("chat.planMode")}</span>
                <span className="text-info-foreground/50">{t("chat.planModeExit")}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />
        <div data-has-suggestion={promptSuggestion ? "" : undefined}>
          <EditorContent editor={editor} />
        </div>
        <InputToolbar
          streaming={streaming}
          disabled={disabled}
          sessionInitializing={sessionInitializing}
          sessionInitError={sessionInitError}
          onRetry={onRetry}
          onSend={send}
          onCancel={onCancel}
          onAttach={() => fileInputRef.current?.click()}
          activeSessionId={activeSessionId}
          showProjectSelector={showProjectSelector}
        />
      </GradientBorderWrapper>
    </div>
  );
}
