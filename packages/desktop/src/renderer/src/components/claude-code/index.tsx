import type { ClaudeCodeUITools } from "../../../../shared/claude-code/types";

import { type DynamicToolUIPart, type ToolUIPart, type UIDataTypes, type UIMessage } from "ai";

import { ClaudeCodeBashOutputTool } from "./bash-output-tool";
import { ClaudeCodeBashTool } from "./bash-tool";
import { ClaudeCodeEditTool } from "./edit-tool";
import { ClaudeCodeGlobTool } from "./glob-tool";
import { ClaudeCodeGrepTool } from "./grep-tool";
import { ClaudeCodeMultiEditTool } from "./multi-edit-tool";
import { ClaudeCodeReadTool } from "./read-tool";
import { ClaudeCodeSlashCommandTool } from "./slash-command-tool";
import { ClaudeCodeTaskTool } from "./task-tool";
import { ClaudeCodeTodoWriteTool } from "./todo-write-tool";
import { ClaudeCodeWebFetchTool } from "./web-fetch-tool";
import { ClaudeCodeWebSearchTool } from "./web-search-tool";
import { ClaudeCodeWriteTool } from "./write-tool";

export {
  ClaudeCodeBashOutputTool,
  ClaudeCodeBashTool,
  ClaudeCodeEditTool,
  ClaudeCodeGlobTool,
  ClaudeCodeGrepTool,
  ClaudeCodeMultiEditTool,
  ClaudeCodeReadTool,
  ClaudeCodeSlashCommandTool,
  ClaudeCodeTaskTool,
  ClaudeCodeTodoWriteTool,
  ClaudeCodeWebFetchTool,
  ClaudeCodeWebSearchTool,
  ClaudeCodeWriteTool,
};

function ClaudeCodeToolUIPartComponent({
  message,
  part,
}: {
  message: UIMessage<unknown, UIDataTypes, ClaudeCodeUITools>;
  part: ToolUIPart<ClaudeCodeUITools> | DynamicToolUIPart;
}) {
  switch (part.type) {
    case "tool-Task":
      return (
        <ClaudeCodeTaskTool
          message={message}
          invocation={part}
          renderToolPart={(childPart) => (
            <ClaudeCodeToolUIPartComponent
              key={childPart.toolCallId}
              message={message}
              part={childPart}
            />
          )}
        />
      );
    case "tool-Bash":
      return <ClaudeCodeBashTool invocation={part} />;
    case "tool-BashOutput":
      return <ClaudeCodeBashOutputTool invocation={part} />;
    case "tool-Read":
      return <ClaudeCodeReadTool invocation={part} />;
    case "tool-Grep":
      return <ClaudeCodeGrepTool invocation={part} />;
    case "tool-Edit":
      return <ClaudeCodeEditTool invocation={part} />;
    case "tool-WebFetch":
      return <ClaudeCodeWebFetchTool invocation={part} />;
    case "tool-WebSearch":
      return <ClaudeCodeWebSearchTool invocation={part} />;
    case "tool-TodoWrite":
      return <ClaudeCodeTodoWriteTool invocation={part} />;
    case "tool-Glob":
      return <ClaudeCodeGlobTool invocation={part} />;
    case "tool-MultiEdit":
      return <ClaudeCodeMultiEditTool invocation={part} />;
    case "tool-Write":
      return <ClaudeCodeWriteTool invocation={part} />;
    case "tool-SlashCommand":
      return <ClaudeCodeSlashCommandTool invocation={part} />;
    default:
      return null;
  }
}

export function ClaudeCodeToolUIPart({
  message,
  part,
}: {
  message: UIMessage<unknown, UIDataTypes, ClaudeCodeUITools>;
  part: ToolUIPart<ClaudeCodeUITools> | DynamicToolUIPart;
}) {
  if (
    !part ||
    part.state === "input-streaming" ||
    part.callProviderMetadata?.claudeCode?.parentToolUseId
  ) {
    return null;
  }

  return (
    <ClaudeCodeToolUIPartComponent
      key={part.toolCallId}
      message={message}
      part={part as ToolUIPart<ClaudeCodeUITools>}
    />
  );
}
