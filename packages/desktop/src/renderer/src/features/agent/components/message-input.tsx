import { useCallback, useEffect, useMemo, useRef } from "react";
import { Extension, useEditor, EditorContent } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "../../../components/ui/button";
import { SendHorizonal, Square, Paperclip } from "lucide-react";
import { createSlashCommandsExtension } from "./slash-commands-extension";
import { createMentionExtension } from "./mention-extension";
import { useAgentStore } from "../store";
import type { JSONContent } from "@tiptap/react";

type Props = {
  onSend: (message: string) => void;
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

export function MessageInput({ onSend, onCancel, streaming, disabled, cwd }: Props) {
  const sendRef = useRef<() => void>(() => {});
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;

  const mentionExtension = useMemo(() => createMentionExtension(() => cwdRef.current), []);

  const slashCommandsExtension = useMemo(
    () =>
      createSlashCommandsExtension(() => {
        const { activeSessionId, sessions } = useAgentStore.getState();
        if (!activeSessionId) return [];
        return (sessions.get(activeSessionId)?.availableCommands ?? []).map((c) => c.name);
      }),
    [],
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
      if (!text) return;
      onSend(text);
      editor.commands.clearContent();
    };
  }, [editor, onSend, streaming]);

  // Keep editable in sync with props
  useEffect(() => {
    editor?.setEditable(!disabled && !streaming);
  }, [editor, disabled, streaming]);

  return (
    <div className="border-t border-border p-4">
      <div className="rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
        <EditorContent editor={editor} />
        <div className="flex items-center gap-1 border-t border-border/50 px-2 py-1">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Attach file">
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
