import Mention from "@tiptap/extension-mention";
import type { SuggestionProps } from "@tiptap/suggestion";
import { createRoot } from "react-dom/client";
import { createElement, createRef } from "react";
import { SuggestionList, type SuggestionItem, type SuggestionListHandle } from "./suggestion-list";

const MOCK_FILES: SuggestionItem[] = [
  { label: "package.json" },
  { label: "tsconfig.json" },
  { label: "README.md" },
];

export const MentionExtension = Mention.configure({
  HTMLAttributes: { class: "mention" },
  suggestion: {
    items: ({ query }: { query: string }) =>
      MOCK_FILES.filter((f) => f.label.toLowerCase().includes(query.toLowerCase())),
    render: () => {
      let root: ReturnType<typeof createRoot> | null = null;
      let container: HTMLDivElement | null = null;
      const ref = createRef<SuggestionListHandle>();

      return {
        onStart(props: SuggestionProps) {
          container = document.createElement("div");
          container.style.position = "absolute";
          container.style.zIndex = "50";
          container.dataset.suggestionPopup = "";
          document.body.appendChild(container);
          root = createRoot(container);
          root.render(
            createElement(SuggestionList, {
              ref,
              items: props.items as SuggestionItem[],
              command: props.command as (item: SuggestionItem) => void,
            }),
          );
          updatePosition(props, container);
        },
        onUpdate(props: SuggestionProps) {
          root?.render(
            createElement(SuggestionList, {
              ref,
              items: props.items as SuggestionItem[],
              command: props.command as (item: SuggestionItem) => void,
            }),
          );
          if (container) updatePosition(props, container);
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

function updatePosition(props: SuggestionProps, container: HTMLDivElement) {
  const rect = props.clientRect?.();
  if (rect) {
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.bottom + 4}px`;
  }
}
