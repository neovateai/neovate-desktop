#!/bin/bash
# Usage: ./scripts/improve-debug-logs.sh [start_index] [end_index]
# Examples:
#   ./scripts/improve-debug-logs.sh        # All features (1-16)
#   ./scripts/improve-debug-logs.sh 3      # Start from feature 3
#   ./scripts/improve-debug-logs.sh 3 5    # Features 3 through 5

set -euo pipefail

START=${1:-1}
END=${2:-16}

# Feature definitions: "name|namespace|directories (comma-separated)"
FEATURES=(
  "app-layout|layout|renderer/src/components/layout,renderer/src/components/sidebar"
  "agent-chat|agent-chat|renderer/src/features/agent/components/chat,renderer/src/features/agent/components/message-input,main/features/agent"
  "session-management|session|renderer/src/features/agent/components/session-list,renderer/src/features/agent/components/branches,renderer/src/features/agent/store.ts"
  "content-panel|content-panel|renderer/src/features/content-panel"
  "terminal|terminal|main/plugins/terminal,renderer/src/plugins/terminal"
  "editor|editor|main/plugins/editor,renderer/src/plugins/editor"
  "file-explorer|files|main/plugins/files,renderer/src/plugins/files"
  "git|git|main/plugins/git,renderer/src/plugins/git"
  "search|search|main/features/utils/search-paths.ts,main/features/utils/search-content.ts,renderer/src/plugins/search"
  "settings|settings|renderer/src/features/settings,renderer/src/features/config,main/features/config"
  "provider|provider|renderer/src/features/provider,main/features/provider"
  "project|project|renderer/src/features/project,main/features/project"
  "skills-plugins|skills|main/features/skills,main/core/plugin,renderer/src/core/plugin"
  "updater|updater|renderer/src/features/updater,main/features/updater"
  "ipc-contracts|ipc|shared,preload"
  "theme-i18n|theme|renderer/src/core/theme,renderer/src/core/i18n"
)

TOTAL=${#FEATURES[@]}
SRC_PREFIX="packages/desktop/src"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Improve Debug Logs — Features $START to $END"
echo "  Branch: $(git branch --show-current)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for i in $(seq "$START" "$END"); do
  idx=$((i - 1))
  if [ $idx -ge $TOTAL ]; then
    echo "Feature index $i out of range (max $TOTAL)"
    break
  fi

  IFS='|' read -r NAME NAMESPACE DIRS <<< "${FEATURES[$idx]}"

  # Convert comma-separated dirs to space-separated full paths
  DIR_LIST=""
  IFS=',' read -ra DIR_ARRAY <<< "$DIRS"
  for d in "${DIR_ARRAY[@]}"; do
    DIR_LIST="$DIR_LIST $SRC_PREFIX/$d"
  done

  echo ""
  echo "┌─────────────────────────────────────────────────"
  echo "│ [$i/$TOTAL] $NAME"
  echo "│ Namespace: neovate:$NAMESPACE"
  echo "│ Dirs:$DIR_LIST"
  echo "└─────────────────────────────────────────────────"

  # Build the prompt
  PROMPT=$(cat <<PROMPT_EOF
You are improving debug logging for the "$NAME" feature in a Neovate Desktop Electron app.

## Target directories
$(for d in $DIR_LIST; do echo "- $d"; done)

## Rules

Read CLAUDE.md first for project conventions. Then read ALL files in the target directories above.

### 1. Add debug logging at critical paths
- Import: \`import debug from "debug"\`
- Create logger: \`const log = debug("neovate:$NAMESPACE")\` (or a more specific sub-namespace like \`neovate:$NAMESPACE:sub-area\`)
- Add \`log()\` calls at:
  - Function entry points for important operations (IPC handlers, state mutations, lifecycle events)
  - Branch decisions that affect control flow
  - Before/after async operations (network, file I/O, subprocess)
  - Error recovery paths
- Keep log messages concise and include relevant data: \`log("session loaded", { id, messageCount })\`
- Do NOT add debug to trivial getters, pure UI render functions, or simple property access

### 2. Replace unnecessary console calls
- Replace \`console.log\` and \`console.warn\` with \`log()\` from debug
- KEEP \`console.error\` inside catch blocks — those are legitimate error handlers
- KEEP \`console.*\` in test files (\`*.test.ts\`)
- If a file has no debug import yet, add one at the top

### 3. Use English only
- Translate any Chinese (or other non-English) messages in log/debug/error strings to English
- Also translate Chinese in Error() constructor messages and throw statements

### 4. Do NOT
- Add logging to files that are already well-instrumented with debug
- Add comments explaining the debug statements
- Change any logic or functionality
- Add type annotations or refactor code
- Touch files outside the target directories

## Validation
After making changes, run: \`bun check\`
If it fails, fix the issues before proceeding.

## Commit
After validation passes:
\`\`\`
git add -A
git commit -m "fix: improve debug logging for $NAME"
\`\`\`
PROMPT_EOF
)

  echo "$PROMPT" | claude -p \
    --dangerously-skip-permissions \
    --output-format=stream-json \
    --model sonnet \
    --verbose

  echo ""
  echo "✓ Completed: $NAME"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done. Processed features $START through $END."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
