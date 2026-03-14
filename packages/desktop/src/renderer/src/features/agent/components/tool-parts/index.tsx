import type { ToolUIPart } from "ai";

import type { ClaudeCodeUITools } from "../../../../../../shared/claude-code/types";

import { AgentTool } from "./agent-tool";
import { AskUserQuestionTool } from "./ask-user-question-tool";
import { BashTool } from "./bash-tool";
import { EditTool } from "./edit-tool";
import { EnterPlanModeTool } from "./enter-plan-mode-tool";
import { EnterWorktreeTool } from "./enter-worktree-tool";
import { ExitPlanModeTool } from "./exit-plan-mode-tool";
import { GlobTool } from "./glob-tool";
import { GrepTool } from "./grep-tool";
import { MultiEditTool } from "./multi-edit-tool";
import { NotebookEditTool } from "./notebook-edit-tool";
import { ReadTool } from "./read-tool";
import { SkillTool } from "./skill-tool";
import { TaskOutputTool } from "./task-output-tool";
import { TaskStopTool } from "./task-stop-tool";
import { TodoWriteTool } from "./todo-write-tool";
import { WebFetchTool } from "./web-fetch-tool";
import { WebSearchTool } from "./web-search-tool";
import { WriteTool } from "./write-tool";

function ClaudeCodeToolUIPart({ part }: { part: ToolUIPart<ClaudeCodeUITools> }) {
  if (!part || part.state === "input-streaming") {
    return null;
  }

  return <ClaudeCodeToolUIPartComponent key={part.toolCallId} part={part} />;
}

function ClaudeCodeToolUIPartComponent({ part }: { part: ToolUIPart<ClaudeCodeUITools> }) {
  switch (part.type) {
    case "tool-Task":
    case "tool-Agent":
      return (
        <AgentTool
          invocation={part}
          renderToolPart={(_childMessage, childPart) => (
            <ClaudeCodeToolUIPartComponent key={childPart.toolCallId} part={childPart} />
          )}
        />
      );
    case "tool-AskUserQuestion":
      return <AskUserQuestionTool invocation={part} />;
    case "tool-Bash":
      return <BashTool invocation={part} />;
    case "tool-Edit":
      return <EditTool invocation={part} />;
    case "tool-MultiEdit":
      return <MultiEditTool invocation={part} />;
    case "tool-Write":
      return <WriteTool invocation={part} />;
    case "tool-Read":
      return <ReadTool invocation={part} />;
    case "tool-Glob":
      return <GlobTool invocation={part} />;
    case "tool-Grep":
      return <GrepTool invocation={part} />;
    case "tool-WebFetch":
      return <WebFetchTool invocation={part} />;
    case "tool-WebSearch":
      return <WebSearchTool invocation={part} />;
    case "tool-TodoWrite":
      return <TodoWriteTool invocation={part} />;
    case "tool-NotebookEdit":
      return <NotebookEditTool invocation={part} />;
    case "tool-TaskOutput":
      return <TaskOutputTool invocation={part} />;
    case "tool-TaskStop":
      return <TaskStopTool invocation={part} />;
    case "tool-Skill":
      return <SkillTool invocation={part} />;
    case "tool-EnterPlanMode":
      return <EnterPlanModeTool invocation={part} />;
    case "tool-ExitPlanMode":
      return <ExitPlanModeTool invocation={part} />;
    case "tool-EnterWorktree":
      return <EnterWorktreeTool invocation={part} />;
    default:
      return null;
  }
}

export { ClaudeCodeToolUIPart };
