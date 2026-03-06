import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import debug from "debug";
import { Extension, useEditor, EditorContent } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "../../../components/ui/button";
import { SendHorizonal, Square, Paperclip, X } from "lucide-react";
import { createSlashCommandsExtension } from "./slash-commands-extension";
import { createMentionExtension } from "./mention-extension";
import { createImagePasteExtension } from "./image-paste-extension";
import { useAgentStore } from "../store";
import { useNewSession } from "../hooks/use-new-session";
import type { JSONContent } from "@tiptap/react";
import type { ImageAttachment } from "../../../../../shared/features/agent/types";

const log = debug("neovate:message-input");

type Props = {
  onSend: (message: string, attachments?: ImageAttachment[]) => void;
  onCancel: () => void;
  streaming: boolean;
  disabled?: boolean;
  cwd: string;
};

function extractText(doc: JSONContent): string {
  const parts: string[] = [];

  function walk(node: JSONContent) {
    if (node.type === "text") {
      parts.push(node.text ?? "");
      return;
    }
    if (node.type === "mention") {
      parts.push(`@${node.attrs?.id ?? node.attrs?.label ?? ""}`);
      return;
    }
    if (node.type === "slashCommand") {
      parts.push(node.attrs?.label ?? "");
      return;
    }
    if (node.type === "codeBlock") {
      const code = (node.content ?? []).map((c) => c.text ?? "").join("");
      parts.push("```\n" + code + "\n```");
      return;
    }
    if (node.content) {
      node.content.forEach(walk);
    }
    if (node.type === "paragraph") {
      parts.push("\n");
    }
  }

  if (doc.content) {
    doc.content.forEach(walk);
  }

  return parts.join("").trim();
}

const NEW_CHAT_EASTER_EGGS = new Set(["exit", "quit", ":q", ":q!", ":wq", ":wq!"]);

export function MessageInput({ onSend, onCancel, streaming, disabled, cwd }: Props) {
  const sendRef = useRef<() => void>(() => {});
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { createNewSession } = useNewSession();

  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

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

  const send = useCallback(() => {
    sendRef.current();
  }, []);

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
                    sendRef.current();
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

  // Keep sendRef in sync with latest props
  useEffect(() => {
    sendRef.current = () => {
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
    };
  }, [editor, onSend, streaming]);

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
      Promise.all(
        imageFiles.map(
          (file) =>
            new Promise<ImageAttachment>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                resolve({
                  id: crypto.randomUUID(),
                  filename: file.name,
                  mediaType: file.type || "image/png",
                  base64: dataUrl.split(",")[1],
                });
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            }),
        ),
      ).then(addAttachments);
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
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border/50 px-3 py-2">
            {attachments.map((att) => (
              <div key={att.id} className="attachment-thumb group relative">
                <img
                  src={`data:${att.mediaType};base64,${att.base64}`}
                  alt={att.filename}
                  className="h-14 w-14 rounded-md object-cover"
                />
                <button
                  type="button"
                  className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
                  onClick={() => removeAttachment(att.id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 border-t border-border/50 px-2 py-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Attach image"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <div className="flex-1" />
          {streaming ? (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="h-7 w-7"
              onClick={onCancel}
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              className="h-7 w-7"
              disabled={disabled}
              onClick={send}
            >
              <SendHorizonal className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
