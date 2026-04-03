import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
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

// --- Inline slash ghost text plugin (mid-line only) ---

type InlineSlashState = {
  /** Position of the `/` character */
  slashPos: number;
  /** The query typed after `/` */
  query: string;
  /** The remaining suffix to show as ghost text */
  ghostSuffix: string;
  /** The full command name (without `/`) */
  commandName: string;
} | null;

const inlineSlashKey = new PluginKey<InlineSlashState>("inlineSlash");

function findInlineSlash(
  state: import("@tiptap/pm/state").EditorState,
  getCommands: () => SlashCommandInfo[],
): InlineSlashState {
  const { selection } = state;
  if (!selection.empty) return null;

  const { $from } = selection;
  // Only handle text blocks
  if (!$from.parent.isTextblock) return null;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");

  // Find the last `/` preceded by whitespace (or at text node start after other content)
  // Must NOT be at offset 0 (start of line is handled by the existing Suggestion plugin)
  const match = textBefore.match(/(?<=\s)\/([a-zA-Z]\w*)$/);
  if (!match) return null;

  const query = match[1];
  if (!query) return null;

  const commands = getCommands();
  const sorted = commands
    .filter((c) => c.name.toLowerCase().startsWith(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (sorted.length === 0) return null;

  const best = sorted[0];
  const ghostSuffix = best.name.slice(query.length);
  if (!ghostSuffix) return null; // Exact match, nothing to ghost

  // Absolute position of the `/`
  const slashPos = $from.pos - query.length - 1;

  return { slashPos, query, ghostSuffix, commandName: best.name };
}

function createInlineSlashPlugin(
  getCommands: () => SlashCommandInfo[],
  editorGetter: () => Editor | null,
) {
  return new Plugin<InlineSlashState>({
    key: inlineSlashKey,
    state: {
      init() {
        return null;
      },
      apply(tr, _prev, _oldState, newState) {
        if (tr.getMeta(inlineSlashKey) === "dismiss") return null;
        return findInlineSlash(newState, getCommands);
      },
    },
    props: {
      decorations(state) {
        const pluginState = inlineSlashKey.getState(state);
        if (!pluginState) return DecorationSet.empty;

        const ghost = document.createElement("span");
        ghost.textContent = pluginState.ghostSuffix;
        ghost.className = "inline-slash-ghost";
        ghost.dataset.inlineSlashGhost = "";

        const deco = Decoration.widget(state.selection.from, ghost, {
          side: 1,
          key: "inline-slash-ghost",
        });
        return DecorationSet.create(state.doc, [deco]);
      },
      handleKeyDown(view, event) {
        const pluginState = inlineSlashKey.getState(view.state);
        if (!pluginState) return false;

        if (event.key === "Tab" && !event.shiftKey) {
          event.preventDefault();
          const editor = editorGetter();
          if (!editor) return false;

          const { slashPos, commandName } = pluginState;
          // Range covers `/query`
          const from = slashPos;
          const to = view.state.selection.from;
          editor
            .chain()
            .focus()
            .deleteRange({ from, to })
            .insertContent([
              { type: "slashCommand", attrs: { label: `/${commandName}` } },
              { type: "text", text: " " },
            ])
            .run();
          return true;
        }

        if (event.key === "Escape") {
          // Dismiss by moving cursor to collapse ghost (re-dispatch a no-op tr)
          view.dispatch(view.state.tr.setMeta(inlineSlashKey, "dismiss"));
          return true;
        }

        return false;
      },
    },
  });
}

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
        createInlineSlashPlugin(getCommands, () => this.editor),
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}
