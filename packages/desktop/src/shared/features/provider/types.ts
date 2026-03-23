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

export type QuickCheckModelTestResult = {
  type: "quick";
  success: boolean;
  error?: string;
};

export type BenchmarkModelTestResult = {
  type: "benchmark";
  success: boolean;
  error?: string;
  ttftMs: number;
  tpot: number;
  tps: number;
  totalTimeMs: number;
  tokensGenerated: number;
};

export type ModelTestResult = QuickCheckModelTestResult | BenchmarkModelTestResult;

export type ProjectProviderConfig = {
  provider?: string;
  model?: string;
};
