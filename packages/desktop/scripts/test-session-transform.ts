/**
 * Usage:
 *   bun scripts/test-session-transform.ts <sessionId>   - test one session
 *   bun scripts/test-session-transform.ts --all          - test all sessions
 */
import { getSessionMessages, listSessions } from "@anthropic-ai/claude-agent-sdk";

import type { ClaudeCodeUIMessage } from "../src/shared/claude-code/types";

import { sessionMessagesToUIMessages } from "../src/main/features/agent/utils/session-messages-to-ui-messages";

function validate(messages: ClaudeCodeUIMessage[]): string[] {
  const issues: string[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg.id) issues.push(`[${i}] ${msg.role}: empty ID`);
    if (seenIds.has(msg.id)) issues.push(`[${i}] ${msg.role}: duplicate ID "${msg.id}"`);
    seenIds.add(msg.id);
    if (msg.parts.length === 0) issues.push(`[${i}] ${msg.role}: no parts`);
  }

  return issues;
}

async function testSession(
  sessionId: string,
): Promise<{ ok: boolean; raw: number; ui: number; issues: string[] }> {
  const raw = await getSessionMessages(sessionId);
  const ui = await sessionMessagesToUIMessages(raw);
  const issues = validate(ui);
  return { ok: issues.length === 0, raw: raw.length, ui: ui.length, issues };
}

const arg = process.argv[2];

if (!arg) {
  console.error(
    "Usage:\n  bun scripts/test-session-transform.ts <sessionId>\n  bun scripts/test-session-transform.ts --all",
  );
  process.exit(1);
}

if (arg === "--all") {
  const sessions = await listSessions();
  let pass = 0,
    fail = 0,
    empty = 0;

  for (const s of sessions) {
    try {
      const result = await testSession(s.sessionId);
      if (result.raw === 0) {
        empty++;
        continue;
      }
      if (result.ok) {
        pass++;
      } else {
        fail++;
        console.log(`✗ ${s.sessionId} (raw=${result.raw} ui=${result.ui})`);
        for (const issue of result.issues) console.log(`    ${issue}`);
      }
    } catch (e) {
      fail++;
      console.log(`✗ ${s.sessionId} ERROR: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n${pass} pass, ${fail} fail, ${empty} empty (${sessions.length} total)`);
  process.exit(fail > 0 ? 1 : 0);
} else {
  const result = await testSession(arg);
  console.log(`Raw: ${result.raw}, UI: ${result.ui}`);
  if (result.ok) {
    console.log("✓ All checks passed");
  } else {
    for (const issue of result.issues) console.log(`✗ ${issue}`);
    process.exit(1);
  }
}
