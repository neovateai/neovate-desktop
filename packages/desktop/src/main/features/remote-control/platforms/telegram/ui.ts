import { InlineKeyboard } from "grammy";

import type { InlineAction } from "../../../../../shared/features/remote-control/types";

/** Build a grammY InlineKeyboard from our generic InlineAction array. */
export function buildInlineKeyboard(actions: InlineAction[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  // Layout: 2 buttons per row, unless there are <= 3 (then 1 per row for readability)
  const perRow = actions.length <= 3 ? 1 : 2;

  for (let i = 0; i < actions.length; i++) {
    keyboard.text(actions[i].label, actions[i].callbackData);
    if ((i + 1) % perRow === 0 && i < actions.length - 1) {
      keyboard.row();
    }
  }

  return keyboard;
}

/** The bot commands registered with Telegram via setMyCommands. */
export const BOT_COMMANDS = [
  { command: "start", description: "Welcome & session list" },
  { command: "chats", description: "List active sessions" },
  { command: "repos", description: "List projects" },
  { command: "branches", description: "List branches for a project" },
  { command: "new", description: "Create new session" },
  { command: "status", description: "Current session status" },
  { command: "stop", description: "Abort current turn" },
  { command: "help", description: "Command reference" },
] as const;
