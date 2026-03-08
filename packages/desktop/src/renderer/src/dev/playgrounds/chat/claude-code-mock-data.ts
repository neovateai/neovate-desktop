// Mock data extracted from a real Claude Code session (fixing issue #80:
// transparent modal background in the custom provider dialog).
// Structured as UIMessage[] for direct rendering.

export const mockMessages = [
  {
    id: "msg-user-1",
    role: "user" as const,
    parts: [
      {
        type: "text" as const,
        text: "https://github.com/neovateai/neovate-code-desktop/issues/80 分析一下",
      },
    ],
  },
  {
    id: "msg-assistant-1",
    role: "assistant" as const,
    parts: [
      {
        type: "tool-Bash" as const,
        toolCallId: "toolu_013ifdgm3Ku5F1iMLAoc5u1V",
        state: "output-available" as const,
        providerExecuted: true,
        input: {
          command:
            "gh issue view 80 --repo neovateai/neovate-code-desktop --json title,body,state,labels,comments,author,createdAt",
          description: "Fetch GitHub issue #80 details",
        },
        output:
          '{"author":{"login":"reporter","name":"Reporter"},"title":"弹框的背景色透明","state":"OPEN","labels":[{"name":"annoyance"}],"body":"### Describe the bug\\n\\nProviders -> add custom provider\\n\\n### Reproduction\\n\\nProviders -> add custom provider\\n\\n### Expected\\n\\nModal should have an opaque background."}',
      },
      {
        type: "text" as const,
        text: "## Issue #80 分析\n\n**标题**: 弹框的背景色透明  \n**状态**: OPEN  \n**严重程度**: annoyance（小问题）  \n**作者**: @reporter\n\n### 问题描述\n\n在 Providers -> add custom provider 时，弹框（Dialog/Modal）的背景色是透明的，导致可以看到底层内容。\n\n### 问题定位\n\n让我查找相关代码。",
      },
      {
        type: "tool-Grep" as const,
        toolCallId: "toolu_017DBavaf6ouxhWs6YHgKBaD",
        state: "output-available" as const,
        providerExecuted: true,
        input: {
          pattern: "custom.*provider|add.*provider",
          glob: "*.tsx",
          "-i": true,
        },
        output: "Found 1 file\nsrc/renderer/components/settings/ProvidersPanel.tsx",
      },
      {
        type: "tool-Read" as const,
        toolCallId: "toolu_01JNZSeQsEEgNU7uAHNg4pja",
        state: "output-available" as const,
        providerExecuted: true,
        input: {
          file_path: "src/renderer/components/settings/ProvidersPanel.tsx",
          offset: 1095,
          limit: 20,
        },
        output:
          '  1099→      {showAddProviderModal && (\n  1100→        <div\n  1101→          className="fixed inset-0 flex items-center justify-center z-50 bg-black/50"\n  1102→          onClick={() => setShowAddProviderModal(false)}\n  1103→        >\n  1104→          <div\n  1105→            className="rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto bg-muted border border-border"\n  1106→            onClick={(e) => e.stopPropagation()}\n  1107→          >',
      },
      {
        type: "text" as const,
        text: "### 问题分析\n\n找到问题代码位置：`src/renderer/components/settings/ProvidersPanel.tsx:1105`\n\nModal 内容区域使用了 `bg-muted` 作为背景色，在某些主题配置下 `bg-muted` 可能是透明或半透明的。",
      },
      {
        type: "tool-Grep" as const,
        toolCallId: "toolu_014AmjRisYjVWd1kvtKKWvpW",
        state: "output-available" as const,
        providerExecuted: true,
        input: {
          pattern: "--muted|--popover|--background",
          glob: "*.css",
          output_mode: "content",
        },
        output:
          "src/renderer/styles/globals.css:28:  --color-background: var(--background);\nsrc/renderer/styles/globals.css:51:  --color-muted-foreground: var(--muted-foreground);\nsrc/renderer/styles/globals.css:52:  --color-muted: var(--muted);\nsrc/renderer/styles/globals.css:57:  --color-popover-foreground: var(--popover-foreground);\nsrc/renderer/styles/globals.css:58:  --color-popover: var(--popover);",
      },
      {
        type: "text" as const,
        text: "### 确认问题\n\n在 `src/renderer/styles/globals.css` 中：\n- **Light theme**: `--muted: --alpha(var(--color-black) / 4%);` (只有 4% 不透明度)\n- **Dark theme**: `--muted: --alpha(var(--color-white) / 4%);` (只有 4% 不透明度)\n\n`bg-muted` 只有 4% 的不透明度，这就是 Modal 背景透明的原因。\n\n### 推荐修复\n\n将 Modal 内容的背景色改为 `bg-popover`（实色背景）。\n\n需要我帮你修复这个问题吗？",
      },
    ],
  },
  {
    id: "msg-user-2",
    role: "user" as const,
    parts: [{ type: "text" as const, text: "修复" }],
  },
  {
    id: "msg-assistant-2",
    role: "assistant" as const,
    parts: [
      {
        type: "tool-Edit" as const,
        toolCallId: "toolu_017KJ5DKsCo2oJLFxDepBj1r",
        state: "output-available" as const,
        providerExecuted: true,
        input: {
          file_path: "src/renderer/components/settings/ProvidersPanel.tsx",
          old_string:
            '            className="rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto bg-muted border border-border"',
          new_string:
            '            className="rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto bg-popover border border-border"',
        },
        output: null,
      },
      {
        type: "tool-Bash" as const,
        toolCallId: "toolu_01XvQcbUHKd24ujk3jhgQZyP",
        state: "output-available" as const,
        providerExecuted: true,
        input: {
          command: "npm run typecheck",
          description: "Run typecheck to verify the fix",
        },
        output:
          "Exit code 127\nsh: tsc: command not found\n\n\n> neovate-code-desktop@0.1.0 typecheck\n> tsc --noEmit",
      },
      {
        type: "tool-Bash" as const,
        toolCallId: "toolu_01YNyvDNLQno4hEpW97HJzok",
        state: "output-available" as const,
        providerExecuted: true,
        input: {
          command: "./node_modules/.bin/tsc --noEmit",
          description: "Run typecheck directly from node_modules",
        },
        output: "Exit code 127\n(eval):1: no such file or directory: ./node_modules/.bin/tsc",
      },
      {
        type: "tool-Read" as const,
        toolCallId: "toolu_01XtdJxWYptSwsWpMA51D5WS",
        state: "output-available" as const,
        providerExecuted: true,
        input: {
          file_path: "src/renderer/components/settings/ProvidersPanel.tsx",
          offset: 1099,
          limit: 15,
        },
        output:
          '  1099→      {showAddProviderModal && (\n  1100→        <div\n  1101→          className="fixed inset-0 flex items-center justify-center z-50 bg-black/50"\n  1102→          onClick={() => setShowAddProviderModal(false)}\n  1103→        >\n  1104→          <div\n  1105→            className="rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto bg-popover border border-border"\n  1106→            onClick={(e) => e.stopPropagation()}\n  1107→          >',
      },
      {
        type: "text" as const,
        text: '已修复。将 Modal 背景色从 `bg-muted`（4% 透明度）改为 `bg-popover`（实色背景）。\n\n**修改文件**: `src/renderer/components/settings/ProvidersPanel.tsx:1105`\n\n现在 "Add Custom Provider" 弹框将显示正确的实色背景。',
      },
    ],
  },
  {
    id: "msg-user-3",
    role: "user" as const,
    parts: [{ type: "text" as const, text: "run dev in bg" }],
  },
  {
    id: "msg-assistant-3",
    role: "assistant" as const,
    parts: [
      {
        type: "tool-Bash" as const,
        toolCallId: "toolu_01HoD3HLHB8q4oFYXygJFk8d",
        state: "output-available" as const,
        providerExecuted: true,
        input: {
          command: "npm run dev",
          description: "Start dev server in background",
        },
        output:
          "Command running in background with ID: b78c1ef. Output is being written to: /tmp/claude/tasks/b78c1ef.output",
      },
      {
        type: "text" as const,
        text: "Dev 服务器已在后台启动。你可以测试 Providers -> Add custom provider 弹框，确认背景色问题已修复。",
      },
    ],
  },
  {
    id: "msg-user-4",
    role: "user" as const,
    parts: [
      {
        type: "text" as const,
        text: "## Context\n\n- Current git status: Not currently on any branch.\nChanges not staged for commit:\n\tmodified:   src/renderer/components/settings/ProvidersPanel.tsx",
      },
    ],
  },
  {
    id: "msg-assistant-4",
    role: "assistant" as const,
    parts: [
      {
        type: "tool-Bash" as const,
        toolCallId: "toolu_01RcTNoS6dSCvdwfV8genvHQ",
        state: "output-available" as const,
        providerExecuted: true,
        input: {
          command: "git checkout -b fix/modal-transparent-background",
          description: "Create new branch for the fix",
        },
        output: "Switched to a new branch 'fix/modal-transparent-background'",
      },
      {
        type: "tool-Bash" as const,
        toolCallId: "toolu_01AT2YDTwAgavVMsMMuBgSEC",
        state: "output-available" as const,
        providerExecuted: true,
        input: {
          command:
            'git add src/renderer/components/settings/ProvidersPanel.tsx && git commit -m "fix: use solid background color for custom provider modal"',
          description: "Stage and commit the fix",
        },
        output:
          "[fix/modal-transparent-background 06f81bd] fix: use solid background color for custom provider modal\n 1 file changed, 1 insertion(+), 1 deletion(-)",
      },
      {
        type: "tool-Bash" as const,
        toolCallId: "toolu_01HNBgctH8LFNzUn7RErR4j9",
        state: "output-available" as const,
        providerExecuted: true,
        input: {
          command: "git push -u origin fix/modal-transparent-background",
          description: "Push branch to origin",
        },
        output:
          "branch 'fix/modal-transparent-background' set up to track 'origin/fix/modal-transparent-background'.\nTo github.com:neovateai/neovate-code-desktop.git\n * [new branch]    fix/modal-transparent-background -> fix/modal-transparent-background",
      },
      {
        type: "tool-Bash" as const,
        toolCallId: "toolu_01A3Zy8pm3KsS2mV37XEERQc",
        state: "output-available" as const,
        providerExecuted: true,
        input: {
          command:
            'gh pr create --title "fix: resolve transparent background in custom provider modal" --body "..."',
          description: "Create pull request",
        },
        output: "https://github.com/neovateai/neovate-code-desktop/pull/86",
      },
      {
        type: "text" as const,
        text: "PR created: https://github.com/neovateai/neovate-code-desktop/pull/86",
      },
    ],
  },
  {
    id: "msg-user-5",
    role: "user" as const,
    parts: [
      {
        type: "text" as const,
        text: "i said a sentence, no Summary no Test plan",
      },
    ],
  },
  {
    id: "msg-assistant-5",
    role: "assistant" as const,
    parts: [
      {
        type: "tool-Bash" as const,
        toolCallId: "toolu_01XAMQYwPfnXdBSYP5AQEPRt",
        state: "output-available" as const,
        providerExecuted: true,
        input: {
          command:
            'gh pr edit 86 --body "Fix transparent modal background by using solid bg-popover instead of 4% opacity bg-muted.\\n\\nFixes #80"',
          description: "Update PR description to one sentence",
        },
        output: "https://github.com/neovateai/neovate-code-desktop/pull/86",
      },
      {
        type: "text" as const,
        text: "Done. PR updated: https://github.com/neovateai/neovate-code-desktop/pull/86",
      },
    ],
  },
];
