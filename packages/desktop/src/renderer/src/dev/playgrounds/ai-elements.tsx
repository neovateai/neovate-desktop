import { useEffect, useRef, useState, type ReactNode } from "react";

import { Message, MessageContent, MessageResponse } from "../../components/ai-elements/message";
import { ScrollArea } from "../../components/ui/scroll-area";
import { ClaudeCodeToolUIPart } from "../../features/agent/components/tool-parts";
import { AgentTool } from "../../features/agent/components/tool-parts/agent-tool";
import { AskUserQuestionTool } from "../../features/agent/components/tool-parts/ask-user-question-tool";
import { BashTool } from "../../features/agent/components/tool-parts/bash-tool";
import { EditTool } from "../../features/agent/components/tool-parts/edit-tool";
import { EnterPlanModeTool } from "../../features/agent/components/tool-parts/enter-plan-mode-tool";
import { EnterWorktreeTool } from "../../features/agent/components/tool-parts/enter-worktree-tool";
import { ExitPlanModeTool } from "../../features/agent/components/tool-parts/exit-plan-mode-tool";
import { GlobTool } from "../../features/agent/components/tool-parts/glob-tool";
import { GrepTool } from "../../features/agent/components/tool-parts/grep-tool";
import { MultiEditTool } from "../../features/agent/components/tool-parts/multi-edit-tool";
import { NotebookEditTool } from "../../features/agent/components/tool-parts/notebook-edit-tool";
import { ReadTool } from "../../features/agent/components/tool-parts/read-tool";
import { SkillTool } from "../../features/agent/components/tool-parts/skill-tool";
import { TaskOutputTool } from "../../features/agent/components/tool-parts/task-output-tool";
import { TaskStopTool } from "../../features/agent/components/tool-parts/task-stop-tool";
import { TodoWriteTool } from "../../features/agent/components/tool-parts/todo-write-tool";
import { WebFetchTool } from "../../features/agent/components/tool-parts/web-fetch-tool";
import { WebSearchTool } from "../../features/agent/components/tool-parts/web-search-tool";
import { WriteTool } from "../../features/agent/components/tool-parts/write-tool";
import { cn } from "../../lib/utils";

type ToolDemo = {
  id: string;
  label: string;
  summary: string;
  render: () => ReactNode;
};

const rendererRoot =
  "/Users/dinq/GitHub/neovateai/neovate-desktop/packages/desktop/src/renderer/src";

const agentMessage = {
  id: "agent:playground-inspector",
  role: "assistant",
  metadata: { sessionId: "demo-session", parentToolUseId: null },
  parts: [
    {
      type: "text",
      text: "I inspected the playground entry point and confirmed the tool demos can live inside AI Elements.",
      state: "done",
    },
    {
      type: "tool-Read",
      toolCallId: "tool-read-from-agent",
      state: "output-available",
      input: {
        file_path: `${rendererRoot}/dev/playground.tsx`,
        limit: 40,
      },
      output: `1→import { lazy, Suspense, useState } from "react";
2→
3→const PLAYGROUNDS = [
4→  { id: "ai-elements", label: "AI Elements" },
5→] as const;`,
      providerExecuted: true,
    },
    {
      type: "text",
      text: "A secondary tool navigation can be added without changing the left-hand playground tabs.",
      state: "done",
    },
  ],
} as any;

const agentInvocation = {
  type: "tool-Agent",
  toolCallId: "tool-agent-demo",
  state: "output-available",
  input: {
    description: "Inspect tool playground architecture",
    prompt:
      "Identify where a secondary tool navigation should live and what demo coverage is missing.",
    subagent_type: "explorer",
  },
  output: agentMessage,
  providerExecuted: true,
} as any;

const askUserQuestionInvocation = {
  type: "tool-AskUserQuestion",
  toolCallId: "tool-ask-user-question-demo",
  state: "output-available",
  input: {
    questions: [
      {
        header: "Grouping",
        question: "How should the AI Elements tool demos be organized?",
        options: [
          {
            label: "One tool per submenu item",
            description: "Makes each renderer easy to inspect in isolation.",
          },
          {
            label: "One long page",
            description: "Keeps everything together but is harder to scan.",
          },
        ],
        multiSelect: false,
      },
    ],
  },
  output: "Selection recorded: render one dedicated submenu item for every tool.",
} as any;

const bashInvocation = {
  type: "tool-Bash",
  toolCallId: "tool-bash-demo",
  state: "output-available",
  input: {
    command: "bun run --filter=neovate-desktop dev",
    description: "Start the desktop playground",
  },
  output: "Starting development server...\n✓ Ready on http://localhost:5173",
} as any;

const editInvocation = {
  type: "tool-Edit",
  toolCallId: "tool-edit-demo",
  state: "output-available",
  input: {
    file_path: `${rendererRoot}/dev/playgrounds/ai-elements.tsx`,
    old_string: 'const [activeToolId, setActiveToolId] = useState("AgentTool");',
    new_string: "const [activeToolId, setActiveToolId] = useState(TOOL_DEMOS[0]!.id);",
  },
  output: "Updated active tool initialization.",
} as any;

const enterPlanModeInvocation = {
  type: "tool-EnterPlanMode",
  toolCallId: "tool-enter-plan-mode-demo",
  state: "output-available",
  input: {},
  output: "Entered plan mode.",
} as any;

const enterWorktreeInvocation = {
  type: "tool-EnterWorktree",
  toolCallId: "tool-enter-worktree-demo",
  state: "output-available",
  input: {
    name: "feat-playground-render-all-tools",
  },
  output:
    "Created /Users/dinq/GitHub/neovateai/neovate-desktop/.worktrees/feat-playground-render-all-tools.",
} as any;

const exitPlanModeInvocation = {
  type: "tool-ExitPlanMode",
  toolCallId: "tool-exit-plan-mode-demo",
  state: "output-available",
  input: {
    plan: "1. Add secondary tool navigation\n2. Render each tool demo separately\n3. Verify types",
  },
  output: "Plan approved. Switching back to implementation mode.",
} as any;

const globInvocation = {
  type: "tool-Glob",
  toolCallId: "tool-glob-demo",
  state: "output-available",
  input: {
    pattern: "**/*tool*.tsx",
    path: `${rendererRoot}/features/agent/components/tool-parts`,
  },
  output: `features/agent/components/tool-parts/agent-tool.tsx
features/agent/components/tool-parts/edit-tool.tsx
features/agent/components/tool-parts/web-search-tool.tsx`,
} as any;

const grepInvocation = {
  type: "tool-Grep",
  toolCallId: "tool-grep-demo",
  state: "output-available",
  input: {
    pattern: "ToolHeader",
    path: `${rendererRoot}/features/agent/components/tool-parts`,
    "-n": true,
  },
  output: `edit-tool.tsx:17:      <ToolHeader type="tool-Edit" state={state} title={title} />
read-tool.tsx:19:      <ToolHeader type="tool-Read" state={state} title={title} />
write-tool.tsx:16:      <ToolHeader type="tool-Write" state={state} title={title} />`,
} as any;

const multiEditInvocation = {
  type: "tool-MultiEdit",
  toolCallId: "tool-multi-edit-demo",
  state: "output-available",
  input: {
    file_path: `${rendererRoot}/dev/playgrounds/ai-elements.tsx`,
    edits: [
      {
        old_string: 'label: "AI Elements"',
        new_string: 'label: "AI Elements Playground"',
      },
      {
        old_string: 'summary: "Nested sub-agent output with a child Read tool."',
        new_string: 'summary: "Nested sub-agent output with an auto-expanded child Read tool."',
      },
    ],
  },
  output: "Applied 2 edits.",
} as any;

const notebookEditInvocation = {
  type: "tool-NotebookEdit",
  toolCallId: "tool-notebook-edit-demo",
  state: "output-available",
  input: {
    notebook_path: "/tmp/playground-analysis.ipynb",
    cell_id: "cell-3",
    cell_type: "code",
    edit_mode: "replace",
    new_source:
      "tool_names = [demo['label'] for demo in TOOL_DEMOS]\nprint(f'{len(tool_names)} tool demos loaded')",
  },
  output: "Updated notebook cell.",
} as any;

const readInvocation = {
  type: "tool-Read",
  toolCallId: "tool-read-demo",
  state: "output-available",
  input: {
    file_path: `${rendererRoot}/dev/playgrounds/ai-elements.tsx`,
    offset: 1,
    limit: 12,
  },
  output: `1→import { useEffect, useRef, useState, type ReactNode } from "react";
2→
3→import { ScrollArea } from "../../components/ui/scroll-area";
4→import { cn } from "../../lib/utils";
5→import { ClaudeCodeToolUIPart } from "../../features/agent/components/tool-parts";`,
} as any;

const skillInvocation = {
  type: "tool-Skill",
  toolCallId: "tool-skill-demo",
  state: "output-available",
  input: {
    skill: "frontend-design",
    args: "Preserve the desktop playground visual language while adding a second sidebar.",
  },
  output:
    "Loaded /frontend-design. Preserve the existing desktop chrome and make the tool navigation feel native to the playground.",
} as any;

const taskInvocation = {
  type: "tool-Task",
  toolCallId: "tool-task-demo",
  state: "output-available",
  input: {
    description: "Review missing tool demos",
    prompt:
      "List the remaining Claude Code tool renderers that still need dedicated playground coverage.",
    subagent_type: "explorer",
  },
  output: [
    {
      type: "text",
      text: "Identified 20 tool renderers that should each have their own playground entry.",
    },
    {
      type: "text",
      text: "Prepared sample invocations for the tool demos that only need static UI rendering.",
    },
  ],
  providerExecuted: true,
} as any;

const taskOutputInvocation = {
  type: "tool-TaskOutput",
  toolCallId: "tool-task-output-demo",
  state: "output-available",
  input: {
    task_id: "task-42",
    block: true,
    timeout: 30000,
  },
  output: `{
  "status": "completed",
  "output": "Generated demo data for AgentTool, EditTool, and the remaining tool renderers."
}`,
} as any;

const taskStopInvocation = {
  type: "tool-TaskStop",
  toolCallId: "tool-task-stop-demo",
  state: "output-available",
  input: {
    task_id: "task-42",
  },
  output: {
    success: true,
    message: "Task stopped.",
  },
} as any;

const todoWriteInvocation = {
  type: "tool-TodoWrite",
  toolCallId: "tool-todo-write-demo",
  state: "output-available",
  input: {
    todos: [
      {
        content: "Split AI Elements tools into submenu items",
        status: "completed",
        activeForm: "Splitting AI Elements tools into submenu items",
      },
      {
        content: "Write demo invocations for every tool renderer",
        status: "in_progress",
        activeForm: "Writing demo invocations for every tool renderer",
      },
      {
        content: "Verify the playground still typechecks",
        status: "pending",
        activeForm: "Verifying the playground still typechecks",
      },
    ],
  },
  output: "Updated todo list.",
} as any;

const webFetchInvocation = {
  type: "tool-WebFetch",
  toolCallId: "tool-web-fetch-demo",
  state: "output-available",
  input: {
    url: "https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-typescript",
    prompt: "Summarize the Claude Code tool invocation shapes needed for a UI playground.",
  },
  output:
    "The Claude Code SDK exposes tool invocations as typed UI parts with input, output, and state fields that can be rendered directly by the client.",
} as any;

const webSearchInvocation = {
  type: "tool-WebSearch",
  toolCallId: "tool-web-search-demo",
  state: "output-available",
  input: {
    query: "Claude Code tool UI invocation examples",
    allowed_domains: ["docs.anthropic.com"],
  },
  output:
    "Found official Claude Code SDK docs covering Bash, Read, Edit, MultiEdit, WebSearch, WebFetch, Task, Agent, and plan-mode tool inputs.",
} as any;

const writeInvocation = {
  type: "tool-Write",
  toolCallId: "tool-write-demo",
  state: "output-available",
  input: {
    file_path: `${rendererRoot}/dev/playgrounds/ai-elements-tool-demos.tsx`,
    content: `export const TOOL_LABELS = [
  "AgentTool",
  "EditTool",
  "WebSearchTool",
];`,
  },
  output: "Wrote file successfully.",
} as any;

const markdownSample = `# Markdown

This playground now renders **Markdown** directly through \`MessageResponse\`.

- Lists
- \`inline code\`
- [links](https://neovateai.dev)

> Blockquotes should inherit the AI Elements typography.

\`\`\`ts
export function renderMarkdown() {
  return "streamdown";
}
\`\`\`
`;

const TOOL_DEMOS: ToolDemo[] = [
  {
    id: "markdown",
    label: "Markdown",
    summary: "Standalone markdown rendering using the AI Elements message renderer.",
    render: () => (
      <Message from="assistant">
        <MessageContent>
          <MessageResponse>{markdownSample}</MessageResponse>
        </MessageContent>
      </Message>
    ),
  },
  {
    id: "agent-tool",
    label: "AgentTool",
    summary: "Nested sub-agent output with a child Read tool.",
    render: () => (
      <AgentTool
        invocation={agentInvocation}
        renderToolPart={(_message, part) => <ClaudeCodeToolUIPart part={part} />}
      />
    ),
  },
  {
    id: "ask-user-question-tool",
    label: "AskUserQuestionTool",
    summary: "Resolved user choice displayed as a tool response.",
    render: () => <AskUserQuestionTool invocation={askUserQuestionInvocation} />,
  },
  {
    id: "bash-tool",
    label: "BashTool",
    summary: "Shell command plus terminal-style output.",
    render: () => <BashTool invocation={bashInvocation} />,
  },
  {
    id: "edit-tool",
    label: "EditTool",
    summary: "Single string replacement preview for a file edit.",
    render: () => <EditTool invocation={editInvocation} />,
  },
  {
    id: "enter-plan-mode-tool",
    label: "EnterPlanModeTool",
    summary: "Plan-mode transition notice.",
    render: () => <EnterPlanModeTool invocation={enterPlanModeInvocation} />,
  },
  {
    id: "enter-worktree-tool",
    label: "EnterWorktreeTool",
    summary: "Worktree creation message for isolated feature work.",
    render: () => <EnterWorktreeTool invocation={enterWorktreeInvocation} />,
  },
  {
    id: "exit-plan-mode-tool",
    label: "ExitPlanModeTool",
    summary: "Plan approval message before returning to implementation.",
    render: () => <ExitPlanModeTool invocation={exitPlanModeInvocation} />,
  },
  {
    id: "glob-tool",
    label: "GlobTool",
    summary: "Matched tool-part files for a glob pattern.",
    render: () => <GlobTool invocation={globInvocation} />,
  },
  {
    id: "grep-tool",
    label: "GrepTool",
    summary: "Pattern matches with file and line numbers.",
    render: () => <GrepTool invocation={grepInvocation} />,
  },
  {
    id: "multi-edit-tool",
    label: "MultiEditTool",
    summary: "Sequential edit preview within one file.",
    render: () => <MultiEditTool invocation={multiEditInvocation} />,
  },
  {
    id: "notebook-edit-tool",
    label: "NotebookEditTool",
    summary: "Edited Jupyter cell source rendered as code.",
    render: () => <NotebookEditTool invocation={notebookEditInvocation} />,
  },
  {
    id: "read-tool",
    label: "ReadTool",
    summary: "Read file output with line markers stripped in the UI.",
    render: () => <ReadTool invocation={readInvocation} />,
  },
  {
    id: "skill-tool",
    label: "SkillTool",
    summary: "Loaded skill output for a UI workflow.",
    render: () => <SkillTool invocation={skillInvocation} />,
  },
  {
    id: "task-tool",
    label: "TaskTool",
    summary: "Task alias rendered through the Agent tool component.",
    render: () => <AgentTool invocation={taskInvocation} />,
  },
  {
    id: "task-output-tool",
    label: "TaskOutputTool",
    summary: "Polled task output rendered as a code block.",
    render: () => <TaskOutputTool invocation={taskOutputInvocation} />,
  },
  {
    id: "task-stop-tool",
    label: "TaskStopTool",
    summary: "Task stop action header for an existing task id.",
    render: () => <TaskStopTool invocation={taskStopInvocation} />,
  },
  {
    id: "todo-write-tool",
    label: "TodoWriteTool",
    summary: "Mixed pending, in-progress, and completed todo states.",
    render: () => <TodoWriteTool invocation={todoWriteInvocation} />,
  },
  {
    id: "web-fetch-tool",
    label: "WebFetchTool",
    summary: "Fetched URL plus summarized result.",
    render: () => <WebFetchTool invocation={webFetchInvocation} />,
  },
  {
    id: "web-search-tool",
    label: "WebSearchTool",
    summary: "Search query rendered with summarized findings.",
    render: () => <WebSearchTool invocation={webSearchInvocation} />,
  },
  {
    id: "write-tool",
    label: "WriteTool",
    summary: "Full file content preview for a write operation.",
    render: () => <WriteTool invocation={writeInvocation} />,
  },
];

function ToolPreview({ demo }: { demo: ToolDemo }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const triggers = containerRef.current?.querySelectorAll<HTMLElement>(
      '[data-slot="collapsible-trigger"]',
    );

    triggers?.forEach((trigger) => {
      if (trigger.getAttribute("aria-expanded") !== "true") {
        trigger.click();
      }
    });
  }, [demo.id]);

  return <div ref={containerRef}>{demo.render()}</div>;
}

export default function AiElementsPlayground() {
  const [activeToolId, setActiveToolId] = useState(TOOL_DEMOS[0]!.id);
  const activeTool = TOOL_DEMOS.find((demo) => demo.id === activeToolId) ?? TOOL_DEMOS[0]!;

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-80 shrink-0 flex-col border-r bg-muted/20">
        <div className="border-b px-4 py-4">
          <h1 className="text-sm font-semibold">Renderers</h1>
          <p className="mt-1 text-xs text-muted-foreground">Select a renderer.</p>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-1 p-2">
            {TOOL_DEMOS.map((demo) => (
              <button
                key={demo.id}
                type="button"
                onClick={() => setActiveToolId(demo.id)}
                className={cn(
                  "rounded-lg px-3 py-2 text-left transition-colors",
                  activeTool.id === demo.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <div className="text-sm font-medium">{demo.label}</div>
                <div
                  className={cn(
                    "mt-1 text-xs leading-5",
                    activeTool.id === demo.id
                      ? "text-accent-foreground/80"
                      : "text-muted-foreground",
                  )}
                >
                  {demo.summary}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>

      <main className="min-w-0 flex-1">
        <ScrollArea className="h-full">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
            <div>
              <h2 className="text-lg font-semibold">{activeTool.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{activeTool.summary}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Playground demos auto-expand the tool body so the renderer can be inspected
                directly.
              </p>
            </div>

            <ToolPreview demo={activeTool} />
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
