import { getSessionMessages, listSessions } from "@anthropic-ai/claude-agent-sdk";
import { describe, it, expect, beforeAll } from "vitest";

import { sessionMessagesToUIMessages } from "../utils/session-messages-to-ui-messages";

function validate(messages: { id: string; role: string; parts: any[] }[]) {
  const issues: string[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (!msg.id) {
      issues.push(`[${i}] ${msg.role}: empty ID`);
    }
    if (seenIds.has(msg.id)) {
      issues.push(`[${i}] ${msg.role}: duplicate ID "${msg.id}"`);
    }
    seenIds.add(msg.id);

    if (msg.role === "user" && msg.parts.length === 0) {
      issues.push(`[${i}] user: no parts`);
    }

    if (msg.role === "assistant") {
      for (const part of msg.parts) {
        if (part.type === "tool-invocation" && !part.toolInvocation?.toolCallId) {
          issues.push(`[${i}] assistant: tool-invocation missing toolCallId`);
        }
      }
    }
  }

  return issues;
}

describe("sessionMessagesToUIMessages with local sessions", () => {
  let sessionIds: string[] = [];

  beforeAll(async () => {
    try {
      const sessions = await listSessions();
      sessionIds = sessions.map((s) => s.sessionId);
    } catch {
      // no sessions available
    }
  });

  it("transforms all local sessions without issues", async () => {
    if (sessionIds.length === 0) return;

    for (const sessionId of sessionIds) {
      const raw = await getSessionMessages(sessionId);
      if (raw.length === 0) continue;

      const messages = await sessionMessagesToUIMessages(raw);
      const issues = validate(messages);

      if (issues.length > 0) {
        console.warn(`Issues in ${sessionId}:\n  ${issues.join("\n  ")}`);
      }

      for (const msg of messages) {
        expect(msg.id, `${sessionId}: message should have a non-empty id`).toBeTruthy();
      }

      const ids = messages.map((m) => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size, `${sessionId}: should have no duplicate IDs`).toBe(ids.length);

      for (const msg of messages) {
        if (msg.role === "user") {
          expect(msg.parts.length, `${sessionId}: user message should have parts`).toBeGreaterThan(
            0,
          );
        }
      }
    }
  });
});
