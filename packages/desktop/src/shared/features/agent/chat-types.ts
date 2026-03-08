import type {
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
  SDKCompactBoundaryMessage,
  SDKSystemMessage,
  SDKResultMessage,
  SDKStatusMessage,
  SDKLocalCommandOutputMessage,
  SDKHookStartedMessage,
  SDKHookProgressMessage,
  SDKHookResponseMessage,
  SDKTaskStartedMessage,
  SDKTaskProgressMessage,
  SDKTaskNotificationMessage,
  SDKFilesPersistedEvent,
  SDKElicitationCompleteMessage,
  SDKToolProgressMessage,
  SDKToolUseSummaryMessage,
  SDKAuthStatusMessage,
  SDKRateLimitEvent,
  SDKPromptSuggestionMessage,
} from "@anthropic-ai/claude-agent-sdk";
// NOTE: `ai` is not yet installed — will be added in PR2.
// TypeScript will report a module-not-found error for these imports until then.
import type { UIMessage, InferUIMessageChunk } from "ai";

// ─── Message metadata ─────────────────────────────────────────────────────────

export type ClaudeCodeMessageMetadata = {
  sessionId: string;
  parentToolUseId: string | null;
};

// ─── Data parts ───────────────────────────────────────────────────────────────

type DataPartEntry<M extends { type: string; subtype: string }> = {
  [K in `${M["type"]}/${M["subtype"]}`]: M;
};

export type ClaudeCodeDataParts = DataPartEntry<SDKSystemMessage> & // → { "system/init": SDKSystemMessage }
  DataPartEntry<SDKCompactBoundaryMessage>; // → { "system/compact_boundary": SDKCompactBoundaryMessage }

// ─── UIMessage / UIMessageChunk ───────────────────────────────────────────────

export type ClaudeCodeUIMessage = UIMessage<
  ClaudeCodeMessageMetadata,
  ClaudeCodeDataParts
>;

export type ClaudeCodeUIMessageChunk = InferUIMessageChunk<ClaudeCodeUIMessage>;

// ─── Event part (union of all event-stream SDK message types) ─────────────────

export type ClaudeCodeUIEventPart =
  | SDKResultMessage
  | SDKSystemMessage
  | SDKStatusMessage
  | SDKLocalCommandOutputMessage
  | SDKHookStartedMessage
  | SDKHookProgressMessage
  | SDKHookResponseMessage
  | SDKTaskStartedMessage
  | SDKTaskProgressMessage
  | SDKTaskNotificationMessage
  | SDKFilesPersistedEvent
  | SDKElicitationCompleteMessage
  | SDKToolProgressMessage
  | SDKToolUseSummaryMessage
  | SDKAuthStatusMessage
  | SDKRateLimitEvent
  | SDKPromptSuggestionMessage;

// ─── Event message (SDK event + id) ──────────────────────────────────────────

export type ClaudeCodeUIEventMessage = { id: string } & ClaudeCodeUIEventPart;

// ─── Interactive request (backend → frontend via subscribe stream) ────────────

export type ClaudeCodeUIEventRequest = {
  type: "permission_request";
  toolName: string;
  input: Record<string, unknown>;
  toolUseId: string;
  suggestions?: PermissionUpdate[];
  blockedPath?: string;
  decisionReason?: string;
  agentId?: string;
};

// ─── Subscribe stream output ──────────────────────────────────────────────────

export type ClaudeCodeUIEvent =
  | { kind: "event"; event: ClaudeCodeUIEventMessage }
  | { kind: "request"; requestId: string; request: ClaudeCodeUIEventRequest };

// ─── Dispatch (frontend → backend via dispatch endpoint) ─────────────────────

export type ClaudeCodeUIDispatch =
  | {
      kind: "respond";
      requestId: string;
      respond: { type: "permission_request"; result: PermissionResult };
    }
  | {
      kind: "configure";
      configure: { type: "set_permission_mode"; mode: PermissionMode };
    };

export type ClaudeCodeUIDispatchResult =
  | { kind: "respond"; ok: boolean }
  | {
      kind: "configure";
      ok: boolean;
      configure: { type: "set_permission_mode"; mode: PermissionMode };
    };
