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

export type ProviderConfig = {
  providers: Provider[];
  provider?: string;
  model?: string;
};

export type ProjectProviderConfig = {
  provider?: string;
  model?: string;
};
