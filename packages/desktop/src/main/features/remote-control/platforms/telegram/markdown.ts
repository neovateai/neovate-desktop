/**
 * Escape special characters for Telegram MarkdownV2.
 * Characters that need escaping outside of code blocks:
 * _ * [ ] ( ) ~ ` > # + - = | { } . !
 */
const SPECIAL_CHARS = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

function escapeMarkdownV2(text: string): string {
  return text.replace(SPECIAL_CHARS, "\\$1");
}

/**
 * Convert standard markdown (from AI output) to Telegram MarkdownV2.
 *
 * Strategy:
 * - Preserve fenced code blocks (```...```) — only escape backticks inside
 * - Preserve inline code (`...`) — only escape backticks inside
 * - Escape all special chars in regular text
 * - Convert **bold** to *bold*
 */
export function toTelegramMarkdownV2(text: string): string {
  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Check for fenced code block
    const fencedMatch = remaining.match(/^(```)([\s\S]*?)(```)/);
    if (fencedMatch && remaining.indexOf(fencedMatch[0]) === 0) {
      // Keep code blocks as-is (Telegram handles them natively in MarkdownV2)
      // Only need to ensure inner content doesn't have unescaped backticks
      const lang = "";
      const inner = fencedMatch[2];
      parts.push("```" + lang + escapeCodeBlock(inner) + "```");
      remaining = remaining.slice(fencedMatch[0].length);
      continue;
    }

    // Check for inline code
    const inlineMatch = remaining.match(/^`([^`]+)`/);
    if (inlineMatch) {
      parts.push("`" + escapeCodeBlock(inlineMatch[1]) + "`");
      remaining = remaining.slice(inlineMatch[0].length);
      continue;
    }

    // Find the next code boundary
    const nextFenced = remaining.indexOf("```");
    const nextInline = remaining.indexOf("`");
    let nextCode = -1;
    if (nextFenced > 0 && nextInline > 0) {
      nextCode = Math.min(nextFenced, nextInline);
    } else if (nextFenced > 0) {
      nextCode = nextFenced;
    } else if (nextInline > 0) {
      nextCode = nextInline;
    }

    if (nextCode > 0) {
      // Process plain text up to the next code boundary
      parts.push(convertPlainText(remaining.slice(0, nextCode)));
      remaining = remaining.slice(nextCode);
    } else {
      // No more code — process rest as plain text
      parts.push(convertPlainText(remaining));
      remaining = "";
    }
  }

  return parts.join("");
}

/** Convert plain text markdown to MarkdownV2. */
function convertPlainText(text: string): string {
  // Convert **bold** to *bold* (Telegram uses single * for bold in MarkdownV2)
  let result = text.replace(/\*\*(.+?)\*\*/g, (_match, content) => {
    return "*" + escapeMarkdownV2(content) + "*";
  });

  // Convert __bold__ to *bold*
  result = result.replace(/__(.+?)__/g, (_match, content) => {
    return "*" + escapeMarkdownV2(content) + "*";
  });

  // Convert _italic_ to _italic_ (already MarkdownV2 format)
  // But we need to escape the content between them
  result = result.replace(/_(.+?)_/g, (_match, content) => {
    return "_" + escapeMarkdownV2(content) + "_";
  });

  // For remaining text that wasn't caught by bold/italic patterns,
  // escape special characters. We need to be careful not to double-escape.
  // Simple approach: escape everything that's not already inside a formatting marker.
  // Since we already handled bold/italic above, just escape the rest.
  result = escapeRemainingText(result);

  return result;
}

/**
 * Escape characters in text that aren't already part of MarkdownV2 formatting.
 * This is a conservative approach — it may over-escape in edge cases,
 * but over-escaping is safe (Telegram just shows the literal character).
 */
function escapeRemainingText(text: string): string {
  // Split on already-formatted segments (between * or _) and escape only the gaps
  const segments: string[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] === "*" || text[i] === "_") {
      const marker = text[i];
      const end = text.indexOf(marker, i + 1);
      if (end > i) {
        // This is a formatted segment — keep as-is
        segments.push(text.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }

    if (text[i] === "\\") {
      // Already escaped — keep both chars
      segments.push(text.slice(i, i + 2));
      i += 2;
      continue;
    }

    // Regular character — escape if special
    const ch = text[i];
    if (SPECIAL_CHARS.test(ch)) {
      // Reset regex lastIndex since we're using test()
      SPECIAL_CHARS.lastIndex = 0;
      segments.push("\\" + ch);
    } else {
      segments.push(ch);
    }
    i++;
  }

  return segments.join("");
}

/** Inside code blocks, only backticks and backslashes need escaping. */
function escapeCodeBlock(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
}
