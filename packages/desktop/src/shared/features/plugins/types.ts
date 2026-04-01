export interface PluginAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface MarketplaceSource {
  source: "github" | "git" | "url" | "local";
  repo?: string;
  url?: string;
  path?: string;
}

export interface Marketplace {
  name: string;
  description?: string;
  source: MarketplaceSource;
  installLocation: string;
  lastUpdated?: string;
  pluginCount: number;
}

export interface MarketplacePlugin {
  name: string;
  description?: string;
  author?: PluginAuthor;
  category?: string;
  homepage?: string;
  version?: string;
  keywords?: string[];
  marketplace: string;
  installed: boolean;
  enabled?: boolean;
}

export interface PluginComponents {
  hasCommands: boolean;
  hasSkills: boolean;
  hasAgents: boolean;
  hasHooks: boolean;
  hasMcpServers: boolean;
  hasLspServers: boolean;
}

export interface InstalledPlugin {
  pluginId: string;
  name: string;
  marketplace: string;
  scope: "user" | "project" | "local";
  installPath: string;
  version: string;
  enabled: boolean;
  installedAt: string;
  lastUpdated: string;
  gitCommitSha?: string;
  description?: string;
  author?: PluginAuthor;
  homepage?: string;
  license?: string;
  keywords?: string[];
  components: PluginComponents;
}

export interface PluginUpdate {
  pluginId: string;
  scope: "user" | "project" | "local";
  currentVersion: string;
  latestSha?: string;
}

export interface PluginError {
  pluginId?: string;
  marketplace?: string;
  type: string;
  message: string;
  timestamp: string;
}
