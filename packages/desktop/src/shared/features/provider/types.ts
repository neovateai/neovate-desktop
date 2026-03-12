export type ProviderModelEntry = { displayName?: string };

export type ProviderModelMap = {
  model?: string;
  haiku?: string;
  opus?: string;
  sonnet?: string;
};

export type Provider = {
  id: string;
  name: string;
  enabled: boolean;
  baseURL: string;
  apiKey: string;
  models: Record<string, ProviderModelEntry>;
  modelMap: ProviderModelMap;
  envOverrides: Record<string, string>;
};

export type ProjectProviderConfig = {
  provider?: string;
  model?: string;
};

export type BenchmarkResult = {
  ttftMs: number; // Time To First Token in milliseconds
  tpot: number; // Time Per Output Token in milliseconds
  tps: number; // Tokens Per Second (1000 / tpot)
  totalTimeMs: number; // Total response time in milliseconds
  tokensGenerated: number;
  success: boolean;
  error?: string;
};
