import Mention from "@tiptap/extension-mention";
import type { SuggestionProps } from "@tiptap/suggestion";
import { createRoot } from "react-dom/client";
import { createElement, createRef } from "react";
import { File } from "lucide-react";
import { SuggestionList, type SuggestionItem, type SuggestionListHandle } from "./suggestion-list";
import { client } from "../../../orpc";
import { positionAboveInput } from "./suggestion-position";

function fileName(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

function dirName(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "" : p.slice(0, i);
}

export function createMentionExtension(getCwd: () => string) {
  return Mention.configure({
    HTMLAttributes: { class: "mention" },
    suggestion: {
      items: async ({ query }: { query: string }): Promise<SuggestionItem[]> => {
        const cwd = getCwd();
        console.debug("[mention] items called, cwd=%s query=%s", cwd, query);
        if (!cwd) return [];

        try {
          const { paths } = await client.utils.searchPaths({
            cwd,
            query,
            maxResults: 20,
          });
          console.debug("[mention] searchPaths returned %d results", paths.length);
          return paths.map((p) => ({
            id: p,
            label: p,
            title: fileName(p),
            description: dirName(p),
          }));
        } catch (err) {
          console.debug("[mention] searchPaths error", err);
          return [];
        }
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
