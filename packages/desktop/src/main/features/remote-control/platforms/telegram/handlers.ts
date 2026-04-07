import type { Context, NextFunction } from "grammy";

import debug from "debug";

import type { InboundMessage } from "../../../../../shared/features/remote-control/types";

const log = debug("neovate:remote-control:telegram");

/** Auth middleware — rejects messages from chats not in the allowed list. */
export function authMiddleware(allowedChatIds: string[]) {
  const allowed = new Set(allowedChatIds);

  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const chatId = String(ctx.chat?.id ?? "");
    if (!allowed.has(chatId)) {
      log("auth rejected: chatId=%s (allowed: %d chats)", chatId, allowed.size);
      await ctx.reply("Unauthorized. This bot is restricted to specific chats.");
      return;
    }
    await next();
  };
}

/** Convert a grammY text message context to our InboundMessage. */
export function toInboundMessage(ctx: Context): InboundMessage {
  return {
    ref: {
      platformId: "telegram",
      chatId: String(ctx.chat!.id),
      threadId: ctx.message?.message_thread_id ? String(ctx.message.message_thread_id) : undefined,
    },
    senderId: String(ctx.from?.id ?? ""),
    text: ctx.message?.text ?? "",
    timestamp: (ctx.message?.date ?? 0) * 1000,
  };
}

/** Convert a grammY callback query context to our InboundMessage. */
export function toCallbackMessage(ctx: Context): InboundMessage {
  return {
    ref: {
      platformId: "telegram",
      chatId: String(ctx.chat?.id ?? ctx.callbackQuery?.message?.chat.id ?? ""),
      threadId: ctx.callbackQuery?.message?.message_thread_id
        ? String(ctx.callbackQuery.message.message_thread_id)
        : undefined,
    },
    senderId: String(ctx.from?.id ?? ""),
    text: "",
    timestamp: Date.now(),
    callbackData: ctx.callbackQuery?.data,
  };
}
