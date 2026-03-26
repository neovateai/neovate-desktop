import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";

import debug from "debug";

import type { PlanApprovalChoice } from "./exit-plan-mode-request-dialog";

import { AskUserQuestionInputSchema } from "../../../../../shared/claude-code/tools/ask-user-question";
import { ExitPlanModeInputSchema } from "../../../../../shared/claude-code/tools/exit-plan-mode";
import { client } from "../../../orpc";
import { useConfigStore } from "../../config/store";
import { claudeCodeChatManager } from "../chat-manager";
import { useClaudeCodeChat } from "../hooks/use-claude-code-chat";
import { useAgentStore } from "../store";
import { AskUserQuestionRequestDialog } from "./ask-user-question-request-dialog";
import { ExitPlanModeRequestDialog } from "./exit-plan-mode-request-dialog";
import { PermissionRequestDialog } from "./permission-request-dialog";

const chatLog = debug("neovate:agent-chat");

type Props = {
  sessionId: string;
};

export function PermissionDialog({ sessionId }: Props) {
  const { pendingRequests, respondToRequest } = useClaudeCodeChat(sessionId);
  const sessionPermissionMode = useAgentStore((s) => s.sessions.get(sessionId)?.permissionMode);
  const globalPermissionMode = useConfigStore((s) => s.permissionMode);

  const activeRequest = pendingRequests[0];
  if (!activeRequest) return null;

  const { requestId, request } = activeRequest;

  // --- AskUserQuestion branch ---
  const askUserQuestion =
    request.toolName === "AskUserQuestion"
      ? AskUserQuestionInputSchema.safeParse(request.input)
      : null;

  // --- ExitPlanMode branch ---
  const exitPlanMode =
    request.toolName === "ExitPlanMode" ? ExitPlanModeInputSchema.safeParse(request.input) : null;

  // ExitPlanMode with empty plan: auto-allow without dialog
  if (exitPlanMode?.success && !exitPlanMode.data.plan?.trim()) {
    chatLog("ExitPlanMode: empty plan, auto-allowing sessionId=%s", sessionId.slice(0, 8));
    void respondToRequest(requestId, {
      type: "permission_request",
      result: { behavior: "allow", updatedInput: request.input as Record<string, unknown> },
    });
    return null;
  }

  const handleResolve = (result: PermissionResult) => {
    chatLog(
      "handleResolvePermission: sessionId=%s requestId=%s behavior=%s",
      sessionId.slice(0, 8),
      requestId,
      result.behavior,
    );
    void respondToRequest(requestId, { type: "permission_request", result });

    // Sync setMode permission updates to agent store so the toolbar reflects the change
    if (result.behavior === "allow" && result.updatedPermissions) {
      const setModeUpdate = result.updatedPermissions.find((u) => u.type === "setMode");
      if (setModeUpdate) {
        chatLog(
          "handleResolvePermission: syncing setMode=%s sessionId=%s",
          setModeUpdate.mode,
          sessionId.slice(0, 8),
        );
        useAgentStore.getState().setPermissionMode(sessionId, setModeUpdate.mode);
      }
    }
  };

  const handleExitPlanModeChoice = async (choice: PlanApprovalChoice) => {
    const input = exitPlanMode?.data;
    if (!input) return;

    if (choice.action === "dismiss") {
      chatLog("ExitPlanMode: dismissed sessionId=%s", sessionId.slice(0, 8));
      await respondToRequest(requestId, {
        type: "permission_request",
        result: { behavior: "deny", message: "User dismissed plan approval" },
      });
      return;
    }

    if (choice.action === "revise") {
      chatLog("ExitPlanMode: revision requested sessionId=%s", sessionId.slice(0, 8));
      await respondToRequest(requestId, {
        type: "permission_request",
        result: {
          behavior: "deny",
          message: choice.feedback || "User requested plan revision",
        },
      });
      return;
    }

    // Approve: respond → store update → SDK dispatch → save plan → context clear
    chatLog(
      "ExitPlanMode: approved sessionId=%s mode=%s clearContext=%s",
      sessionId.slice(0, 8),
      choice.mode,
      choice.clearContext,
    );

    // 1. Return allow — SDK runs ExitPlanMode.call()
    await respondToRequest(requestId, {
      type: "permission_request",
      result: { behavior: "allow", updatedInput: input as Record<string, unknown> },
    });

    // 2. Update agent store (UI: dropdown, plan mode pill)
    useAgentStore.getState().setPermissionMode(sessionId, choice.mode);

    // 3. Override SDK's prePlanMode with user's selection
    const chat = claudeCodeChatManager.getChat(sessionId);
    chat?.dispatch({
      kind: "configure",
      configure: { type: "set_permission_mode", mode: choice.mode },
    });

    // 4. Save plan to disk
    client.agent.savePlan({ sessionId, plan: input.plan }).catch(() => {});

    // 5. If clear context, register pending action
    if (choice.clearContext) {
      const cwd = useAgentStore.getState().sessions.get(sessionId)?.cwd;
      chat?.store.setState({
        pendingContextClear: { plan: input.plan, mode: choice.mode, cwd },
      });
    }
  };

  // --- Render ---
  const pendingCount = pendingRequests.length;
  const pendingIndex = pendingRequests.findIndex((r) => r.requestId === requestId);
  const permissionMode = sessionPermissionMode ?? globalPermissionMode ?? "default";

  let content = (
    <PermissionRequestDialog
      key={requestId}
      request={request}
      pendingCount={pendingCount}
      pendingIndex={pendingIndex >= 0 ? pendingIndex : 0}
      permissionMode={permissionMode}
      onResolve={handleResolve}
    />
  );

  if (askUserQuestion?.success) {
    content = (
      <AskUserQuestionRequestDialog
        key={requestId}
        input={askUserQuestion.data}
        onResolve={handleResolve}
      />
    );
  } else if (exitPlanMode?.success) {
    content = (
      <ExitPlanModeRequestDialog
        key={requestId}
        plan={exitPlanMode.data.plan}
        onChoice={handleExitPlanModeChoice}
      />
    );
  }

  return (
    <div className="relative z-10 mx-4 min-w-0 max-w-full">
      <div
        className="rounded-[12px] shadow-[0_4px_4px_rgba(0,0,0,0.04)]"
        style={{
          border: "3px solid transparent",
          background:
            "linear-gradient(var(--color-background), var(--color-background)) padding-box,linear-gradient(180deg,var(--color-background) 0%, color-mix(in srgb, var(--color-background) 50%, transparent) 100%) border-box",
        }}
      >
        <div
          className="overflow-hidden rounded-lg"
          style={{
            border: "2px solid transparent",
            backgroundColor: "var(--background)",
            color: "var(--foreground)",
            background:
              "linear-gradient(var(--background-secondary)) padding-box,linear-gradient(0deg,color-mix(in srgb, var(--primary) 30%, transparent) 0,transparent 80%,transparent)border-box",
          }}
        >
          {content}
        </div>
      </div>
    </div>
  );
}
