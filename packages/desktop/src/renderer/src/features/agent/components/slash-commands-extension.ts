import { Node, type Editor, mergeAttributes } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import debug from "debug";
import { Terminal } from "lucide-react";
import { createElement, createRef } from "react";
import { createRoot } from "react-dom/client";

import type { SlashCommandInfo } from "../../../../../shared/features/agent/types";

import { SuggestionList, type SuggestionItem, type SuggestionListHandle } from "./suggestion-list";
import { positionAboveInput } from "./suggestion-position";

const slashLog = debug("neovate:slash-commands");

export function createSlashCommandsExtension(getCommands: () => SlashCommandInfo[]) {
  return Node.create({
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
          items: ({ query }: { query: string }): SuggestionItem[] => {
            const commands = getCommands();
            slashLog(
              "items query=%s commands=%o",
              query,
              commands.map((c) => c.name),
            );
            const items: SuggestionItem[] = commands.map((cmd) => ({
              label: `/${cmd.name}`,
              description: cmd.description,
            }));
            if (!query) return items;
            return items.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));
          },
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
                container.style.position = "fixed";
                container.style.zIndex = "50";
                container.dataset.suggestionPopup = "";
                document.body.appendChild(container);
                root = createRoot(container);
                root.render(
                  createElement(SuggestionList, {
                    ref,
                    items: props.items,
                    command: props.command,
                    header: "Commands",
                    icon: createElement(Terminal, { className: "h-4 w-4" }),
                  }),
                );
                positionAboveInput(props.editor, container);
              },
              onUpdate(props: SuggestionProps<SuggestionItem>) {
                root?.render(
                  createElement(SuggestionList, {
                    ref,
                    items: props.items,
                    command: props.command,
                    header: "Commands",
                    icon: createElement(Terminal, { className: "h-4 w-4" }),
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
}
