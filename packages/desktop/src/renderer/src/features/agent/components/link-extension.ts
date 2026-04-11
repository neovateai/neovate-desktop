import Link from "@tiptap/extension-link";

/**
 * Custom Link extension for chat input.
 * - Auto-detects URLs while typing (autolink)
 * - Converts pasted URLs to links (linkOnPaste)
 * - Applies custom styling via .chat-link class
 */
export const ChatLink = Link.configure({
  autolink: true,
  linkOnPaste: true,
  protocols: [],
  defaultProtocol: "https",
  openOnClick: false,
  HTMLAttributes: {
    class: "chat-link",
    rel: "noopener noreferrer",
    target: "_blank",
  },
});
