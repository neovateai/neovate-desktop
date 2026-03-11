import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";

import debug from "debug";

import { AskUserQuestionInputSchema } from "../../../../../shared/claude-code/tools/ask-user-question";
import { useClaudeCodeChat } from "../hooks/use-claude-code-chat";
import { AskUserQuestionRequestDialog } from "./ask-user-question-request-dialog";
import { PermissionRequestDialog } from "./permission-request-dialog";

const chatLog = debug("neovate:agent-chat");

type Props = {
  sessionId: string;
};

export function PermissionDialog({ sessionId }: Props) {
  const { pendingRequests, respondToRequest } = useClaudeCodeChat(sessionId);
  const activeRequest = pendingRequests[0];
  if (!activeRequest) return null;

  const { requestId, request } = activeRequest;
  const askUserQuestion =
    request.toolName === "AskUserQuestion"
      ? AskUserQuestionInputSchema.safeParse(request.input)
      : null;
  const handleResolve = (result: PermissionResult) => {
    chatLog(
      "handleResolvePermission: sessionId=%s requestId=%s behavior=%s",
      sessionId.slice(0, 8),
      requestId,
      result.behavior,
    );
    void respondToRequest(requestId, { type: "permission_request", result });
  };

  let content = (
    <PermissionRequestDialog key={requestId} request={request} onResolve={handleResolve} />
  );

  if (askUserQuestion?.success) {
    content = (
      <AskUserQuestionRequestDialog
        key={requestId}
        input={askUserQuestion.data}
        onResolve={handleResolve}
      />
    );
  }

  return <div className="relative z-10 mx-4">{content}</div>;
}
