export interface SummaryStats {
  totalCost: number;
  totalTokens: number;
  cacheTokens: number;
  cachePercentage: number;
  totalSessions: number;
  todaySessions: number;
  linesOfCodeAdded: number;
  linesOfCodeRemoved: number;
  costChangePercent: number;
}

export interface ModelCostData {
  date: string;
  model: string;
  displayName: string;
  cost: number;
}

export interface ActivityDay {
  date: string;
  count: number;
}

export interface HourlyActivity {
  hour: number;
  count: number;
}

export interface SessionBucket {
  bucket: string;
  count: number;
}

export interface ErrorRateStats {
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
}

export interface CacheHitTrend {
  date: string;
  rate: number;
}

export interface TokenStats {
  model: string;
  displayName: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface CostEfficiencyPoint {
  date: string;
  costPerSession: number;
  sessionCount: number;
}

export interface ModelMixData {
  model: string;
  displayName: string;
  cost: number;
  requests: number;
  percentage: number;
}

// Tools analytics types
export interface ToolFrequency {
  toolName: string;
  count: number;
  successes: number;
  failures: number;
}

export interface ToolDuration {
  toolName: string;
  avgDurationMs: number;
}

export interface CodeEditDecision {
  language: string;
  accepts: number;
  rejects: number;
}

export interface ToolTimelineSeries {
  name: string;
  data: number[];
}

export interface ToolTimelineData {
  dates: string[];
  series: ToolTimelineSeries[];
}

// Wrapped summary types
export interface WrappedData {
  // Hero stats
  totalSessions: number;
  totalTokens: number;
  totalCost: number;
  totalHours: number;

  // Code output
  linesAdded: number;
  linesRemoved: number;
  filesModified: number;

  // Preferences
  topModel: { name: string; percentage: number } | null;
  favoriteTool: { name: string; count: number } | null;

  // Habits
  codingStreak: number;
  peakHour: number;
  avgSessionMinutes: number;

  // Persona
  persona: string;
  personaDescription: string;

  // Fun facts
  funFacts: string[];
}

// Combined data for a single fetch
export interface UsageData {
  summary: SummaryStats;
  costTrend: ModelCostData[];
  activityHeatmap: ActivityDay[];
  hourlyActivity: HourlyActivity[];
  sessionBuckets: SessionBucket[];
  errorRate: ErrorRateStats;
  cacheHitTrend: CacheHitTrend[];
  tokenStats: TokenStats[];
  costEfficiencyTrend: CostEfficiencyPoint[];
  modelMix: ModelMixData[];
  // Tools analytics
  toolFrequency: ToolFrequency[];
  toolDuration: ToolDuration[];
  codeEditDecisions: CodeEditDecision[];
  toolTimeline: ToolTimelineData;
  // Wrapped summary (null if no data for the selected year)
  wrapped: WrappedData | null;
}
