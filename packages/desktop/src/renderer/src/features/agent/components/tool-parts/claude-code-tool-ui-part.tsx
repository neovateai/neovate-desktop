import type { UIMessage, ToolInvocationPart } from "../../../../../../shared/features/agent/types";

import { AskUserQuestionToolCard } from "./ask-user-question-tool-card";
import { BashToolCard } from "./bash-tool-card";
import { TodoWriteToolCard } from "./todo-write-tool-card";
import { EditToolCard } from "./edit-tool-card";
import { GenericToolCard } from "./generic-tool-card";
import { GlobToolCard } from "./glob-tool-card";
import { GrepToolCard } from "./grep-tool-card";
import { MultiEditToolCard } from "./multi-edit-tool-card";
import { NotebookEditToolCard } from "./notebook-edit-tool-card";
import { ReadToolCard } from "./read-tool-card";
import { TaskToolCard } from "./task-tool-card";
import { TaskOutputToolCard } from "./task-output-tool-card";
import { TaskStopToolCard } from "./task-stop-tool-card";
import { WebFetchToolCard } from "./web-fetch-tool-card";
import { WebSearchToolCard } from "./web-search-tool-card";
import { WriteToolCard } from "./write-tool-card";

type Props = {
  part: ToolInvocationPart;
  /** Full agent message list — only needed by Task tool for child lookup. */
  messages: UIMessage[];
  /** Session ID — needed for AskUserQuestion to submit answers. */
  sessionId?: string;
};

/**
 * Dispatcher component: switches on `part.toolName` to render the
 * appropriate tool-specific card component.
 *
 * Top-level child tool parts (those with a `parentToolUseId`) are *not*
 * rendered here — they are rendered inside the `TaskToolCard` to form a
 * nested tree.  The caller should filter them out.
 */
export function ClaudeCodeToolUIPart({ part, messages, sessionId }: Props) {
  switch (part.toolName) {
    case "AskUserQuestion":
      return <AskUserQuestionToolCard part={part} sessionId={sessionId} />;
    case "Bash":
      return <BashToolCard part={part} />;
    case "TodoWrite":
      return <TodoWriteToolCard part={part} />;
    case "Read":
      return <ReadToolCard part={part} />;
    case "Edit":
      return <EditToolCard part={part} />;
    case "MultiEdit":
      return <MultiEditToolCard part={part} />;
    case "Write":
      return <WriteToolCard part={part} />;
    case "Glob":
      return <GlobToolCard part={part} />;
    case "Grep":
      return <GrepToolCard part={part} />;
    case "WebFetch":
      return <WebFetchToolCard part={part} />;
    case "WebSearch":
      return <WebSearchToolCard part={part} />;
    case "NotebookEdit":
      return <NotebookEditToolCard part={part} />;
    case "Task":
      return <TaskToolCard part={part} messages={messages} />;
    case "TaskOutput":
      return <TaskOutputToolCard part={part} />;
    case "TaskStop":
      return <TaskStopToolCard part={part} />;
    // Simple tools use the generic card
    case "SlashCommand":
    case "ExitPlanMode":
      return <GenericToolCard part={part} />;
    default:
      // Future-proof: unknown tool names fall through to generic
      return <GenericToolCard part={part} />;
  }
}
