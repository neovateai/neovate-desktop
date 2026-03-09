import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import debug from "debug";
import { Extension, useEditor, EditorContent } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { createSlashCommandsExtension } from "./slash-commands-extension";
import { createMentionExtension } from "./mention-extension";
import { createImagePasteExtension } from "./image-paste-extension";
import { AttachmentPreview } from "./attachment-preview";
import { InputToolbar } from "./input-toolbar";
import { useAgentStore } from "../store";
import { useNewSession } from "../hooks/use-new-session";
import { useEventCallback } from "../../../hooks/use-event-callback";
import { useLatestRef } from "../../../hooks/use-latest-ref";
import { extractText } from "../utils/extract-text";
import { readFileAsAttachment } from "../utils/read-file-as-attachment";
import type { ImageAttachment } from "../../../../../shared/features/agent/types";

const log = debug("neovate:message-input");

type Props = {
  onSend: (message: string, attachments?: ImageAttachment[]) => void;
  onCancel: () => void;
  streaming: boolean;
  disabled?: boolean;
  cwd: string;
};

const NEW_CHAT_EASTER_EGGS = new Set(["exit", "quit", ":q", ":q!", ":wq", ":wq!"]);

export function MessageInput({ onSend, onCancel, streaming, disabled, cwd }: Props) {
  const cwdRef = useLatestRef(cwd);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { createNewSession } = useNewSession();

  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const availableModels = useAgentStore((s) =>
    activeSessionId ? s.sessions.get(activeSessionId)?.availableModels : undefined,
  );
  const currentModel = useAgentStore((s) =>
    activeSessionId ? s.sessions.get(activeSessionId)?.currentModel : undefined,
  );

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
        placeholder: "Type a message...",
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
                  if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
                    if (document.querySelector("[data-suggestion-popup]")) return false;
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
                  if (event.key === "Enter" && event.altKey) {
                    editor.commands.setHardBreak();
                    return true;
                  }
                  if (event.key === "Escape") {
                    editor.commands.clearContent();
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
        class: "tiptap min-h-[36px] max-h-[200px] overflow-y-auto px-3 py-2 text-sm outline-none",
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

  // Listen for insert-mention events from file tree
  useEffect(() => {
    if (!editor) return;
    const handler = (e: Event) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail;
      log("insert-mention received path=%s", path);
      editor
        .chain()
        .focus()
        .insertContent([
          { type: "mention", attrs: { id: path, label: path } },
          { type: "text", text: " " },
        ])
        .run();
    };
    window.addEventListener("neovate:insert-mention", handler);
    return () => window.removeEventListener("neovate:insert-mention", handler);
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
    <div className="border-t border-border p-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      <div className="rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
        <EditorContent editor={editor} />
        <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />
        <InputToolbar
          streaming={streaming}
          disabled={disabled}
          onSend={send}
          onCancel={onCancel}
          onAttach={() => fileInputRef.current?.click()}
          availableModels={availableModels}
          currentModel={currentModel}
          activeSessionId={activeSessionId}
        />
      </div>
    </div>
  );
}
