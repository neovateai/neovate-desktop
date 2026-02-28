#!/usr/bin/env bun

/**
 * Waits for the Electron app's CDP endpoint to be available,
 * then prints the WebSocket URL for agent-browser.
 *
 * Usage:
 *   # Start app first: ELECTRON_CDP_PORT=9222 bun run dev
 *   WS=$(bun .claude/skills/electron-e2e/scripts/cdp-connect.ts)
 *   agent-browser --cdp "$WS" snapshot -i
 */

const port = process.env.ELECTRON_CDP_PORT ?? "9222";
const url = `http://localhost:${port}/json/version`;
const maxWait = 30_000;
const start = Date.now();

while (Date.now() - start < maxWait) {
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as { webSocketDebuggerUrl: string };
      console.log(data.webSocketDebuggerUrl);
      process.exit(0);
    }
  } catch {
    // Not ready yet
  }
  await new Promise((r) => setTimeout(r, 500));
}

console.error(`Timed out waiting for CDP on port ${port}`);
process.exit(1);
