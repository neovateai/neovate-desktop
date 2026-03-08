import type {
  CanUseTool,
  PermissionMode,
  PermissionResult,
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
import type { UIMessage, InferUIMessageChunk, DataUIPart } from "ai";

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
export type ClaudeCodeDataUIPart = DataUIPart<ClaudeCodeDataParts>;

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

// ─── Interactive requests (backend → frontend via subscribe stream) ───────────

type ClaudeCodePermissionRequest = {
  type: "permission_request";
  toolName: Parameters<CanUseTool>[0];
  input: Parameters<CanUseTool>[1];
} & Omit<Parameters<CanUseTool>[2], "signal">;

// Union — extend here as new request types are added
export type ClaudeCodeUIEventRequest = ClaudeCodePermissionRequest;

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
