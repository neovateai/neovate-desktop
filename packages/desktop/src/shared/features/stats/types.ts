export type TimeRange = "today" | "week" | "month" | "year";

export type SummaryStats = {
  totalCostUsd: number;
  costChangePercent: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  cacheHitRate: number;
  requestCount: number;
  sessionCount: number;
  errorRate: number;
};

export type CostDataPoint = {
  date: string;
  cost: number;
  modelBreakdown?: Record<string, number>;
};

export type ModelStats = {
  model: string;
  requestCount: number;
  totalCost: number;
  totalTokens: number;
};

export type ActivityDay = {
  date: string;
  count: number;
};
