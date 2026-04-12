import Link from "@tiptap/extension-link";
import { Extension } from "@tiptap/react";

/**
 * Exit link extension - when typing space after a link, exit the link mark.
 */
const ExitLinkOnSpace = Extension.create({
  name: "exitLinkOnSpace",

  addKeyboardShortcuts() {
    return {
      Space: () => {
        const { editor } = this;
        const { from } = editor.state.selection;

        // Check if cursor is at the end of a link
        const $from = editor.state.doc.resolve(from);
        const linkMark = editor.schema.marks.chatLink;

        if (!linkMark) return false;

        // Check if we're inside a link
        const marks = $from.marks();
        const isInsideLink = marks.some((mark) => mark.type === linkMark);

        if (!isInsideLink) return false;

        // Check if we're at the end of the link
        let linkEnd = from;
        for (let i = $from.depth; i > 0; i--) {
          const node = $from.node(i);
          if (node.marks.some((mark) => mark.type === linkMark)) {
            linkEnd = $from.end(i);
            break;
          }
        }

        // If at end of link, insert space outside the link
        if (from === linkEnd) {
          editor
            .chain()
            .focus()
            .unsetMark("chatLink", { extendEmptyMarkRange: true })
            .insertContent(" ")
            .run();
          return true;
        }

        return false;
      },
    };
  },
});

/**
 * Custom Link extension for chat input.
 * - Auto-detects URLs while typing (autolink)
 * - Applies custom styling via .chat-link class
 * - Exits link mark when typing space
 */
export const ChatLink = Link.extend({
  inclusive() {
    // 禁用 inclusive，确保光标在链接末尾时不会继续扩展链接
    return false;
  },
}).configure({
  autolink: true,
  linkOnPaste: false,
  protocols: [],
  defaultProtocol: "https",
  openOnClick: false,
  HTMLAttributes: {
    class: "chat-link",
    rel: "noopener noreferrer",
    target: "_blank",
  },
});

export { ExitLinkOnSpace };
