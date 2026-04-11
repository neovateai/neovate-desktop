import type { JSONContent } from "@tiptap/react";

export function extractText(doc: JSONContent): string {
  const parts: string[] = [];

  function walk(node: JSONContent) {
    if (node.type === "text") {
      const text = node.text ?? "";

      // 检查是否有链接 mark，如果有则使用 href
      const linkMark = node.marks?.find((m) => m.type === "chatLink");
      if (linkMark?.attrs?.href) {
        parts.push(linkMark.attrs.href);
        return;
      }

      // 将不间断空格转换为普通空格（用于显示缩进）
      parts.push(text.replace(/\u00A0/g, " "));
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
    if (node.type === "hardBreak") {
      parts.push("\n");
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
