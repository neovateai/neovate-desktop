import type { SuggestionProps } from "@tiptap/suggestion";

import Mention from "@tiptap/extension-mention";
import { File } from "lucide-react";
import { createElement, createRef } from "react";
import { createRoot } from "react-dom/client";

import { client } from "../../../orpc";
import { SuggestionList, type SuggestionItem, type SuggestionListHandle } from "./suggestion-list";
import { positionAboveInput } from "./suggestion-position";

function fileName(p: string): string {
  const clean = p.endsWith("/") ? p.slice(0, -1) : p;
  const i = clean.lastIndexOf("/");
  return i === -1 ? clean : clean.slice(i + 1);
}

function dirName(p: string): string {
  const clean = p.endsWith("/") ? p.slice(0, -1) : p;
  const i = clean.lastIndexOf("/");
  return i <= 0 ? "" : clean.slice(0, i);
}

let searchVersion = 0;

export function createMentionExtension(getCwd: () => string) {
  return Mention.configure({
    HTMLAttributes: { class: "mention" },
    suggestion: {
      items: async ({ query }: { query: string }): Promise<SuggestionItem[]> => {
        const cwd = getCwd();
        if (!cwd) return [];

        const version = ++searchVersion;

        // Debounce: wait 100ms for typing to settle
        await new Promise((r) => setTimeout(r, 100));
        if (version !== searchVersion) return [];

        try {
          const { paths } = await client.utils.searchPaths({
            cwd,
            query,
            maxResults: 15,
          });
          if (version !== searchVersion) return [];
          return paths.map((p) => ({
            id: p,
            label: p,
            title: fileName(p),
            description: dirName(p),
            isDirectory: p.endsWith("/"),
          }));
        } catch {
          return [];
        }
      },
      command: ({ editor, range, props }: any) => {
        if ((props as SuggestionItem).isDirectory) {
          // Drill-down: atomically replace @query with @dir/ to re-trigger suggestion
          editor.chain().focus().insertContentAt(range, `@${props.label}`).run();
          return;
        }

        // Normal file: insert as mention node
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: "mention", attrs: { id: props.id, label: props.label } },
            { type: "text", text: " " },
          ])
          .run();
      },
      render: () => {
        let root: ReturnType<typeof createRoot> | null = null;
        let container: HTMLDivElement | null = null;
        const ref = createRef<SuggestionListHandle>();

        return {
          onStart(props: SuggestionProps) {
            container = document.createElement("div");
            container.style.position = "fixed";
            container.style.zIndex = "50";
            container.dataset.suggestionPopup = "";
            document.body.appendChild(container);
            root = createRoot(container);
            root.render(
              createElement(SuggestionList, {
                ref,
                items: props.items as SuggestionItem[],
                command: props.command as (item: SuggestionItem) => void,
                header: "Files",
                icon: createElement(File, { className: "h-4 w-4" }),
              }),
            );
            positionAboveInput(props.editor, container);
          },
          onUpdate(props: SuggestionProps) {
            root?.render(
              createElement(SuggestionList, {
                ref,
                items: props.items as SuggestionItem[],
                command: props.command as (item: SuggestionItem) => void,
                header: "Files",
                icon: createElement(File, { className: "h-4 w-4" }),
              }),
            );
            if (container) positionAboveInput(props.editor, container);
          },
          onKeyDown(props: { event: KeyboardEvent }) {
            if (props.event.key === "Escape") {
              cleanup();
              return true;
            }
            return ref.current?.onKeyDown(props) ?? false;
          },
          onExit() {
            cleanup();
          },
        };

        function cleanup() {
          root?.unmount();
          container?.remove();
          root = null;
          container = null;
        }
      },
    },
  });
}
