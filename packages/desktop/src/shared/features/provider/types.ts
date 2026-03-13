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
  builtInId?: string;
};

export type BenchmarkResult = {
  ttftMs: number;
  tpot: number;
  tps: number;
  totalTimeMs: number;
  tokensGenerated: number;
  success: boolean;
  error?: string;
};

export type ProjectProviderConfig = {
  provider?: string;
  model?: string;
};
