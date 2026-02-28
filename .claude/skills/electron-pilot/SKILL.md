---
name: electron-pilot
description: Agentic E2E testing and debugging for this Electron app using agent-browser via CDP. Use this skill whenever the user asks to "test the app", "debug this", "check if the UI works", "figure out what's wrong", "verify my changes", "test it", "why is X broken", or any task where you need to visually inspect, interact with, or debug the running Electron application. This is for AI-driven exploration — you decide what to check, click, and verify based on context. For scripted/repeatable tests, use Playwright instead.
---

# Electron Pilot

This skill lets you — the AI agent — interactively test and debug the running Electron app. Unlike scripted Playwright tests that follow fixed steps, you use agent-browser to explore the app, make decisions about what to check, and adapt based on what you see.

## When to Use This vs Playwright

| Scenario | Tool |
|---|---|
| "Test if my changes work" | **This skill** — explore, screenshot, verify |
| "Debug why X is broken" | **This skill** — inspect state, read console, try interactions |
| "Verify the UI renders after refactor" | **This skill** — snapshot and visually confirm |
| "Write a regression test for X" | **Playwright** — scripted, repeatable, runs in CI |
| "Add E2E test coverage" | **Playwright** — deterministic assertions |

## Connection Setup

Electron 30+ requires `app.commandLine.appendSwitch()` for CDP — already wired in `src/main/index.ts` behind `is.dev` + `ELECTRON_CDP_PORT`.

**`agent-browser --cdp 9222` does NOT work with Electron** due to a Playwright `connectOverCDP` HTTP discovery issue. Always use the full WebSocket URL.

### Start the app

```bash
# Kill any existing process on the port
lsof -ti:9222 | xargs kill -9 2>/dev/null

# Start with CDP enabled
ELECTRON_CDP_PORT=9222 bun run dev &
```

### Connect

```bash
# Wait for CDP to be ready and get the WebSocket URL
until curl -s http://localhost:9222/json/version > /dev/null 2>&1; do sleep 1; done
WS=$(curl -s http://localhost:9222/json/version | grep webSocketDebuggerUrl | cut -d'"' -f4)

# Now use agent-browser
agent-browser --cdp "$WS" snapshot -i
```

Or use the helper script:

```bash
WS=$(bun .claude/skills/electron-pilot/scripts/cdp-connect.ts)
agent-browser --cdp "$WS" snapshot -i
```

## Core Workflow: Explore → Decide → Act → Verify

Unlike scripted tests, you drive the session:

1. **Snapshot** to see what's on screen: `agent-browser --cdp "$WS" snapshot -i`
2. **Decide** what to do based on the refs and what you're investigating
3. **Act** — click, fill, select, scroll
4. **Re-snapshot** to see the result (refs invalidate after DOM changes!)
5. **Repeat** until you've verified the behavior or found the bug

## Capabilities

### Inspect the UI

```bash
# See all interactive elements
agent-browser --cdp "$WS" snapshot -i

# Scope to a specific area
agent-browser --cdp "$WS" snapshot -s "[data-testid='app-root']"

# Include cursor-interactive elements (onclick divs, etc.)
agent-browser --cdp "$WS" snapshot -i -C

# Get text content of a specific element
agent-browser --cdp "$WS" get text @e1

# Get current URL and page title
agent-browser --cdp "$WS" get url
agent-browser --cdp "$WS" get title
```

### Interact

```bash
agent-browser --cdp "$WS" click @e1
agent-browser --cdp "$WS" fill @e2 "some text"
agent-browser --cdp "$WS" select @e1 "Option Name"
agent-browser --cdp "$WS" press Enter
agent-browser --cdp "$WS" scroll down 500
```

### Visual Inspection

```bash
# Screenshot
agent-browser --cdp "$WS" screenshot /tmp/current.png

# Annotated screenshot (numbered labels on elements)
agent-browser --cdp "$WS" screenshot --annotate

# Full page screenshot
agent-browser --cdp "$WS" screenshot --full

# Visual diff against a baseline
agent-browser --cdp "$WS" diff screenshot --baseline /tmp/before.png
```

### Read Console (Debugging)

agent-browser can't read past console output. Install an interceptor first, then read logs anytime:

```bash
# Install (run once per page load)
agent-browser --cdp "$WS" eval --stdin <<'EVALEOF'
(function() {
  window.__logs = [];
  const o = { log: console.log, warn: console.warn, error: console.error };
  for (const k of ['log','warn','error']) {
    console[k] = function() {
      window.__logs.push({ level: k, msg: Array.from(arguments).map(String).join(' '), ts: Date.now() });
      o[k].apply(console, arguments);
    };
  }
  return 'interceptor installed';
})()
EVALEOF

# Read all captured logs
agent-browser --cdp "$WS" eval 'JSON.stringify(window.__logs.splice(0), null, 2)'

# Read only errors
agent-browser --cdp "$WS" eval 'JSON.stringify(window.__logs.filter(l => l.level === "error"), null, 2)'
```

### Inspect JavaScript State

```bash
# Check page info
agent-browser --cdp "$WS" eval 'document.title'

# Run any JS in the page context
agent-browser --cdp "$WS" eval --stdin <<'EVALEOF'
JSON.stringify({
  url: window.location.href,
  sessionStorage: Object.keys(sessionStorage),
  localStorage: Object.keys(localStorage),
})
EVALEOF
```

### Wait for Async Operations

```bash
agent-browser --cdp "$WS" wait 2000                  # Fixed delay
agent-browser --cdp "$WS" wait --load networkidle     # Wait for network to settle
agent-browser --cdp "$WS" wait "#some-element"        # Wait for element to appear
```

## Debugging Patterns

### "Something looks wrong"

1. Take a screenshot to see the current state
2. Snapshot interactive elements
3. Install console interceptor
4. Interact with the suspect area
5. Check console for errors
6. Screenshot again to compare

### "The UI is stuck / not responding"

1. Snapshot — check if elements are `[disabled]`
2. Read console for errors
3. Check if there's a pending network request via eval
4. Try clicking/interacting to see if anything responds

### "I changed something, does it still work?"

1. Screenshot the current state before changes
2. Make your code changes
3. Wait for HMR to reload (electron-vite supports this)
4. Screenshot again
5. Diff the screenshots: `agent-browser diff screenshot --baseline /tmp/before.png`
6. Snapshot and interact to verify functionality

## Cleanup

```bash
# Close agent-browser (disconnects, does NOT kill the Electron app)
agent-browser close

# Kill the Electron app
lsof -ti:9222 | xargs kill 2>/dev/null
```

## Gotchas

1. **Always re-snapshot after DOM changes** — refs like `@e1` are invalidated
2. **Console interceptor resets on page reload** — reinstall after HMR or navigation
3. **Port conflicts** — kill existing processes before starting: `lsof -ti:9222 | xargs kill -9 2>/dev/null`
4. **`agent-browser close` only disconnects** — the Electron app keeps running

Read `references/testing-patterns.md` for app-specific patterns (ACP connect flow, permission dialogs, chat UI).
