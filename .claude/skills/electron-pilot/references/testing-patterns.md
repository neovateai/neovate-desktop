# Testing Patterns for Neovate Desktop

Common E2E test patterns for the ACP-powered agent chat UI.

## App Structure

The app has two main states:

1. **Connect screen** — shown when no session is active
   - Agent selector dropdown (combobox)
   - Working directory input (textbox)
   - Connect button

2. **Chat screen** — shown after connecting to an agent
   - Message list (assistant + user messages, tool calls)
   - Message input + Send/Cancel button
   - Permission dialog (appears inline when agent requests permission)

## Test: Verify Initial Render

```bash
agent-browser --cdp "$WS" snapshot -i
# Expected refs:
#   combobox (agent selector)
#   option "Select an agent..." [disabled] [selected]
#   option "Claude Code"
#   textbox "Working directory (optional)"
#   button "Connect" [disabled]
```

The Connect button should be `[disabled]` until an agent is selected.

## Test: Select Agent and Enable Connect

```bash
agent-browser --cdp "$WS" select @e1 "Claude Code"
agent-browser --cdp "$WS" snapshot -i
# Connect button should no longer be [disabled]
```

## Test: Fill Working Directory

```bash
agent-browser --cdp "$WS" fill @e4 "/Users/me/project"
agent-browser --cdp "$WS" snapshot -i
```

## Test: Click Connect (Expect Loading State)

```bash
agent-browser --cdp "$WS" click @e5
agent-browser --cdp "$WS" wait 1000
agent-browser --cdp "$WS" snapshot -i
# Expected: button text changes to "Connecting..."
# All inputs become [disabled]
```

Note: Without a real agent process (e.g., `claude --acp`), the connection will eventually fail. The test verifies the UI enters the loading state correctly.

## Test: Screenshot Comparison

```bash
# Take a baseline screenshot
agent-browser --cdp "$WS" screenshot /tmp/baseline.png

# ... make changes ...

# Compare
agent-browser --cdp "$WS" diff screenshot --baseline /tmp/baseline.png
```

## Test: Check for Console Errors

```bash
# Install interceptor first (see SKILL.md)
# Then after interactions:
agent-browser --cdp "$WS" eval 'JSON.stringify(window.__logs.filter(l => l.level === "error"), null, 2)'
```

## Test: Verify No Crash After Multiple Interactions

```bash
# Rapid interaction sequence
agent-browser --cdp "$WS" select @e1 "Claude Code"
agent-browser --cdp "$WS" fill @e4 "/tmp"
agent-browser --cdp "$WS" click @e5
agent-browser --cdp "$WS" wait 2000
agent-browser --cdp "$WS" screenshot /tmp/after-connect.png
agent-browser --cdp "$WS" snapshot -i
# Verify no crash — snapshot should return elements
```

## Data-testid Attributes

The app uses `data-testid` attributes for stable selectors:

- `data-testid="app-root"` — root container
- `data-testid="app-title"` — header title

You can scope snapshots to specific areas:

```bash
agent-browser --cdp "$WS" snapshot -s "[data-testid='app-root']"
```
