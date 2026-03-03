import { Node, type Editor, mergeAttributes } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { createRoot } from "react-dom/client";
import { createElement, createRef } from "react";
import { SuggestionList, type SuggestionItem, type SuggestionListHandle } from "./suggestion-list";

const COMMANDS: SuggestionItem[] = [
  { label: "/clear", description: "Clear conversation" },
  { label: "/compact", description: "Compact history" },
  { label: "/help", description: "Show help" },
];

export const SlashCommandsExtension = Node.create({
  name: "slashCommand",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      label: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-slash-command]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-slash-command": "",
        class: "slash-command",
      }),
      node.attrs.label,
    ];
  },

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: true,
        items: ({ query }: { query: string }) =>
          COMMANDS.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())),
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: { from: number; to: number };
          props: SuggestionItem;
        }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              { type: "slashCommand", attrs: { label: props.label } },
              { type: "text", text: " " },
            ])
            .run();
        },
        render: () => {
          let root: ReturnType<typeof createRoot> | null = null;
          let container: HTMLDivElement | null = null;
          const ref = createRef<SuggestionListHandle>();

          return {
            onStart(props: SuggestionProps<SuggestionItem>) {
              container = document.createElement("div");
              container.style.position = "absolute";
              container.style.zIndex = "50";
              container.dataset.suggestionPopup = "";
              document.body.appendChild(container);
              root = createRoot(container);
              root.render(
                createElement(SuggestionList, {
                  ref,
                  items: props.items,
                  command: props.command,
                }),
              );
              updatePosition(props, container);
            },
            onUpdate(props: SuggestionProps<SuggestionItem>) {
              root?.render(
                createElement(SuggestionList, {
                  ref,
                  items: props.items,
                  command: props.command,
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
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

function updatePosition(props: SuggestionProps<SuggestionItem>, container: HTMLDivElement) {
  const rect = props.clientRect?.();
  if (rect) {
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.bottom + 4}px`;
  }
}
