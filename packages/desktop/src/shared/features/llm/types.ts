export type LlmQueryOptions = {
  model?: string;
  maxTokens?: number;
  system?: string;
  temperature?: number;
  signal?: AbortSignal;
};

export type LlmMessage = {
  role: "user" | "assistant";
  content: string;
};

export type LlmQueryResult = {
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string;
};

export interface ILlmService {
  /** Check if auxiliary LLM is configured (has a provider with credentials). */
  isConfigured(): boolean;

  /** Simple text-in/text-out query. Default maxTokens: 4096, temperature: 0. */
  query(prompt: string, opts?: LlmQueryOptions): Promise<string>;

  /** Full messages API query. Default maxTokens: 4096, temperature: 0. */
  queryMessages(messages: LlmMessage[], opts?: LlmQueryOptions): Promise<LlmQueryResult>;
}
