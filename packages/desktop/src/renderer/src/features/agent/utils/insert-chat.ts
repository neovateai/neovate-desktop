import type { JSONContent } from "@tiptap/react";

export type InsertChatDetail = {
  text?: string;
  mentions?: Array<{ id: string; label?: string }>;
};

export function buildInsertChatContent({ text, mentions = [] }: InsertChatDetail): JSONContent[] {
  const content: JSONContent[] = [];

  for (const [index, mention] of mentions.entries()) {
    content.push({
      type: "mention",
      attrs: { id: mention.id, label: mention.label ?? mention.id },
    });

    if (index < mentions.length - 1 || !text || !/^\s/.test(text)) {
      content.push({ type: "text", text: " " });
    }
  }

  if (text) {
    content.push({ type: "text", text });
  }

  return content;
}
