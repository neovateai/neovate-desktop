import { randomBytes } from "node:crypto";

import type { MessageItem, SendMessageReq } from "./types";

import { sendMessage } from "./api";
import { MessageItemType, MessageState, MessageType } from "./types";

function isMediaItem(item: MessageItem): boolean {
  return (
    item.type === MessageItemType.IMAGE ||
    item.type === MessageItemType.VIDEO ||
    item.type === MessageItemType.FILE ||
    item.type === MessageItemType.VOICE
  );
}

export function extractTextBody(itemList?: MessageItem[]): string {
  if (!itemList?.length) return "";
  for (const item of itemList) {
    if (item.type === MessageItemType.TEXT && item.text_item?.text != null) {
      const text = String(item.text_item.text);
      const ref = item.ref_msg;
      if (!ref) return text;
      if (ref.message_item && isMediaItem(ref.message_item)) return text;
      const parts: string[] = [];
      if (ref.title) parts.push(ref.title);
      if (ref.message_item) {
        const refBody = extractTextBody([ref.message_item]);
        if (refBody) parts.push(refBody);
      }
      if (!parts.length) return text;
      return `[引用: ${parts.join(" | ")}]\n${text}`;
    }
    if (item.type === MessageItemType.VOICE && item.voice_item?.text) {
      return item.voice_item.text;
    }
  }
  return "";
}

function generateClientId(): string {
  return `neovate:${Date.now()}-${randomBytes(4).toString("hex")}`;
}

export async function sendText(params: {
  baseUrl: string;
  token: string;
  to: string;
  text: string;
  contextToken?: string;
}): Promise<void> {
  if (!params.contextToken) return;
  const req: SendMessageReq = {
    msg: {
      from_user_id: "",
      to_user_id: params.to,
      client_id: generateClientId(),
      message_type: MessageType.BOT,
      message_state: MessageState.FINISH,
      item_list: params.text
        ? [{ type: MessageItemType.TEXT, text_item: { text: params.text } }]
        : undefined,
      context_token: params.contextToken,
    },
  };
  await sendMessage({ baseUrl: params.baseUrl, token: params.token, body: req });
}
