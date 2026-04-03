import type { ProviderTemplate } from "./built-in";

export const BUILT_IN_PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    description: {
      "en-US": "Official Anthropic API",
      "zh-CN": "Anthropic 官方 API",
    },
    baseURL: "https://api.anthropic.com",
    apiKeyURL: "https://console.anthropic.com/settings/keys",
    docURL: "https://docs.anthropic.com/en/docs/about-claude/models",
    models: {
      "claude-opus-4-6": { displayName: "Claude Opus 4.6" },
      "claude-sonnet-4-6": { displayName: "Claude Sonnet 4.6" },
      "claude-haiku-4-5": { displayName: "Claude Haiku 4.5" },
    },
    modelMap: {
      model: "claude-opus-4-6",
      sonnet: "claude-sonnet-4-6",
      haiku: "claude-haiku-4-5",
      opus: "claude-opus-4-6",
    },
    envOverrides: {},
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: {
      "en-US": "Multi-model API aggregator",
      "zh-CN": "多模型 API 聚合平台",
    },
    baseURL: "https://openrouter.ai/api",
    apiKeyURL: "https://openrouter.ai/settings/keys",
    docURL: "https://openrouter.ai/models",
    models: {
      "anthropic/claude-opus-4.6": { displayName: "Claude Opus 4.6" },
      "anthropic/claude-sonnet-4.6": { displayName: "Claude Sonnet 4.6" },
      "anthropic/claude-haiku-4.5": { displayName: "Claude Haiku 4.5" },
      "google/gemini-3-pro-preview": { displayName: "Gemini 3 Pro" },
      "google/gemini-3-flash-preview": { displayName: "Gemini 3 Flash" },
      "z-ai/glm-5": { displayName: "GLM-5" },
      "deepseek/deepseek-reasoner": { displayName: "DeepSeek Reasoner" },
      "deepseek/deepseek-chat": { displayName: "DeepSeek Chat" },
      "moonshotai/kimi-k2.5": { displayName: "Kimi K2.5" },
      "minimax/minimax-m2.5": { displayName: "MiniMax-M2.5" },
    },
    modelMap: {},
    envOverrides: {},
  },
  {
    id: "glm-cn",
    name: "GLM (CN)",
    nameLocalized: { "zh-CN": "智谱 GLM（国内）" },
    description: {
      "en-US": "Zhipu AI models, China endpoint",
      "zh-CN": "智谱 AI 模型，国内端点",
    },
    baseURL: "https://open.bigmodel.cn/api/anthropic",
    apiKeyURL: "https://open.bigmodel.cn/usercenter/apikeys",
    docURL: "https://docs.bigmodel.cn/cn/coding-plan/overview",
    models: {
      "glm-5": { displayName: "GLM-5" },
    },
    modelMap: {
      model: "glm-5",
    },
    envOverrides: {},
  },
  {
    id: "glm-global",
    name: "GLM (Global)",
    nameLocalized: { "zh-CN": "智谱 GLM（国际）" },
    description: {
      "en-US": "Zhipu AI models, global endpoint",
      "zh-CN": "智谱 AI 模型，国际端点",
    },
    baseURL: "https://api.z.ai/api/anthropic",
    docURL: "https://docs.z.ai/devpack/overview",
    models: {
      "glm-5": { displayName: "GLM-5" },
    },
    modelMap: {
      model: "glm-5",
    },
    envOverrides: {},
  },
  {
    id: "kimi",
    name: "Kimi",
    description: {
      "en-US": "Moonshot's Kimi coding model",
      "zh-CN": "月之暗面 Kimi 编程模型",
    },
    baseURL: "https://api.kimi.com/coding/",
    docURL: "https://www.kimi.com/coding/docs/en/third-party-agents.html",
    models: {
      "kimi-for-coding": { displayName: "Kimi K2.5" },
    },
    modelMap: {
      model: "kimi-for-coding",
    },
    envOverrides: {},
  },
  {
    id: "moonshot",
    name: "Moonshot",
    description: {
      "en-US": "Kimi K2.5 via Moonshot API",
      "zh-CN": "通过 Moonshot API 使用 Kimi K2.5",
    },
    baseURL: "https://api.moonshot.cn/anthropic",
    docURL: "https://platform.moonshot.cn/docs/api/chat",
    models: {
      sonnet: { displayName: "Kimi K2.5" },
    },
    modelMap: {
      model: "sonnet",
    },
    envOverrides: {},
  },
  {
    id: "minimax-cn",
    name: "MiniMax (CN)",
    nameLocalized: { "zh-CN": "MiniMax（国内）" },
    description: {
      "en-US": "MiniMax M2.5 model, China endpoint",
      "zh-CN": "MiniMax M2.5 模型，国内端点",
    },
    baseURL: "https://api.minimaxi.com/anthropic",
    docURL: "https://platform.minimaxi.com/docs/coding-plan/intro",
    models: {
      "minimax-m2.5": { displayName: "MiniMax-M2.5" },
    },
    modelMap: {
      model: "minimax-m2.5",
    },
    envOverrides: {},
  },
  {
    id: "minimax-global",
    name: "MiniMax (Global)",
    nameLocalized: { "zh-CN": "MiniMax（国际）" },
    description: {
      "en-US": "MiniMax M2.5 model, global endpoint",
      "zh-CN": "MiniMax M2.5 模型，国际端点",
    },
    baseURL: "https://api.minimax.io/anthropic",
    docURL: "https://platform.minimax.io/docs/coding-plan/intro",
    models: {
      "minimax-m2.5": { displayName: "MiniMax-M2.5" },
    },
    modelMap: {
      model: "minimax-m2.5",
    },
    envOverrides: {},
  },
  {
    id: "bailian",
    name: "Aliyun Bailian",
    nameLocalized: { "zh-CN": "阿里云百炼" },
    description: {
      "en-US": "Alibaba Cloud multi-model aggregator",
      "zh-CN": "阿里云多模型聚合平台",
    },
    baseURL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
    docURL: "https://help.aliyun.com/zh/model-studio/coding-plan",
    models: {
      "qwen3.5-plus": { displayName: "Qwen 3.5 Plus" },
      "qwen3-coder-next": { displayName: "Qwen 3 Coder Next" },
      "qwen3-coder-plus": { displayName: "Qwen 3 Coder Plus" },
      "kimi-k2.5": { displayName: "Kimi K2.5" },
      "glm-5": { displayName: "GLM-5" },
      "glm-4.7": { displayName: "GLM-4.7" },
      "MiniMax-M2.5": { displayName: "MiniMax-M2.5" },
    },
    modelMap: {
      model: "kimi-k2.5",
    },
    envOverrides: {},
  },
  {
    id: "zenmux",
    name: "ZenMux",
    description: {
      "en-US": "Multi-model API aggregator",
      "zh-CN": "多模型 API 聚合平台",
    },
    baseURL: "https://zenmux.ai/api/anthropic",
    docURL: "https://docs.zenmux.ai/",
    models: {
      "anthropic/claude-opus-4.6": { displayName: "Claude Opus 4.6" },
      "anthropic/claude-sonnet-4.6": { displayName: "Claude Sonnet 4.6" },
      "anthropic/claude-haiku-4.5": { displayName: "Claude Haiku 4.5" },
      "google/gemini-3-pro-preview": { displayName: "Gemini 3 Pro" },
      "google/gemini-3-flash-preview": { displayName: "Gemini 3 Flash" },
      "z-ai/glm-5": { displayName: "GLM-5" },
      "deepseek/deepseek-reasoner": { displayName: "DeepSeek Reasoner" },
      "deepseek/deepseek-chat": { displayName: "DeepSeek Chat" },
      "moonshotai/kimi-k2.5": { displayName: "Kimi K2.5" },
      "minimax/minimax-m2.5": { displayName: "MiniMax-M2.5" },
    },
    modelMap: {},
    envOverrides: {},
  },
];
