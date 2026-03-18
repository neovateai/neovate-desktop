import Placeholder from "@tiptap/extension-placeholder";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Extension, useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import debug from "debug";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ImageAttachment, PermissionMode } from "../../../../../shared/features/agent/types";

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
import { createImagePasteExtension } from "./image-paste-extension";
import { InputToolbar } from "./input-toolbar";
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
  cwd: string;
  dockAttached?: boolean;
};

const NEW_CHAT_EASTER_EGGS = new Set(["exit", "quit", ":q", ":q!", ":wq", ":wq!"]);

export function MessageInput({
  onSend,
  onCancel,
  streaming,
  disabled,
  sessionInitializing,
  cwd,
  dockAttached = false,
}: Props) {
  const { t } = useTranslation();
  const cwdRef = useLatestRef(cwd);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { createNewSession } = useNewSession();

  const activeSessionId = useAgentStore((s) => s.activeSessionId);
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

  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
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
      }),
      Placeholder.configure({
        placeholder: t("chat.placeholder"),
      }),
      mentionExtension,
      slashCommandsExtension,
      imagePasteExtension,
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
    },
    editable: !disabled && !streaming,
    autofocus: "end",
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
  });

  // Keep editable in sync with props
  useEffect(() => {
    editor?.setEditable(!disabled && !streaming);
  }, [editor, disabled, streaming]);

  // Close suggestion popups when settings opens
  const showSettings = useSettingsStore((s) => s.showSettings);
  useEffect(() => {
    if (showSettings) {
      document.querySelectorAll("[data-suggestion-popup]").forEach((el) => el.remove());
    }
  }, [showSettings]);

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
      <div
        className="rounded-[12px] shadow-[0_4px_4px_rgba(0,0,0,0.04)]"
        style={{
          border: "3px solid transparent",
          background:
            "linear-gradient(var(--color-background), var(--color-background)) padding-box,linear-gradient(180deg,var(--color-background) 0%, color-mix(in srgb, var(--color-background) 50%, transparent) 100%) border-box",
        }}
      >
        <div
          className={cn(
            "border border-input focus-within:!border-primary/50 overflow-hidden",
            dockAttached ? "rounded-b-lg rounded-t-[18px]" : "rounded-lg",
          )}
          style={{
            border: "2px solid transparent",
            backgroundColor: "var(--background)",
            color: "var(--foreground)",
            transition: "all .2s",
            background:
              "linear-gradient(var(--background-secondary)) padding-box,linear-gradient(0deg,color-mix(in srgb, var(--primary) 30%, transparent) 0,transparent 80%,transparent)border-box",
          }}
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
          <EditorContent editor={editor} />
          <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />
          <InputToolbar
            streaming={streaming}
            disabled={disabled}
            sessionInitializing={sessionInitializing}
            onSend={send}
            onCancel={onCancel}
            onAttach={() => fileInputRef.current?.click()}
            activeSessionId={activeSessionId}
          />
        </div>
      </div>
    </div>
  );
}
