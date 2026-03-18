export type InspectorState = "enabled" | "failed" | "not-enabled";

export type RequestUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
};

export type RequestSummary = {
  id: string;
  sessionId: string;
  phase: "start" | "end";
  timestamp: number;
  turnIndex: number;

  // Request info (both phases)
  url: string;
  method: string;
  model?: string;
  isStream?: boolean;
  headers: Record<string, string>;

  // Request body summary (start phase)
  messageCount?: number;
  toolNames?: string[];
  systemPromptLength?: number;
  maxTokens?: number;

  // Response info (end phase only)
  status?: number;
  duration?: number;
  responseHeaders?: Record<string, string>;
  stopReason?: string;
  usage?: RequestUsage;
  contentBlockTypes?: string[];
  error?: string;
};

export type RequestDetail = {
  id: string;
  request: {
    headers: Record<string, string>;
    rawBody: string;
  };
  response?: {
    headers: Record<string, string>;
    body: unknown;
  };
};

export type InterceptorMessage = {
  id: string;
  phase: "start" | "end";
  sessionId: string;
  timestamp: number;
  url: string;
  method: string;
  model?: string;
  isStream?: boolean;
  headers: Record<string, string>;
  messageCount?: number;
  toolNames?: string[];
  systemPromptLength?: number;
  maxTokens?: number;
  status?: number;
  duration?: number;
  responseHeaders?: Record<string, string>;
  stopReason?: string;
  usage?: RequestUsage;
  contentBlockTypes?: string[];
  error?: string;
  detail?: {
    request?: { headers: Record<string, string>; rawBody: string };
    response?: { headers: Record<string, string>; body: unknown };
  };
};
