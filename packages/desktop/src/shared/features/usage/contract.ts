import { oc, type } from "@orpc/contract";
import { z } from "zod";

import type {
  ActivityDay,
  CacheHitTrend,
  CostEfficiencyPoint,
  ErrorRateStats,
  HourlyActivity,
  ModelCostData,
  ModelMixData,
  SessionBucket,
  SummaryStats,
  TokenStats,
  UsageData,
} from "./types";

// Time range schema
export const timeRangeSchema = z.enum(["today", "week", "month"]);
export type TimeRange = z.infer<typeof timeRangeSchema>;

// Query input schema
const usageQueryInputSchema = z.object({
  timeRange: timeRangeSchema,
});

export const usageContract = {
  // Get all usage data in a single call
  getData: oc.input(usageQueryInputSchema).output(type<UsageData>()),

  // Individual endpoints for more granular fetching
  getSummary: oc.input(usageQueryInputSchema).output(type<SummaryStats>()),

  getCostTrend: oc.input(usageQueryInputSchema).output(type<ModelCostData[]>()),

  getActivityHeatmap: oc.output(type<ActivityDay[]>()),

  getHourlyActivity: oc.input(usageQueryInputSchema).output(type<HourlyActivity[]>()),

  getSessionBuckets: oc.input(usageQueryInputSchema).output(type<SessionBucket[]>()),

  getErrorRate: oc.input(usageQueryInputSchema).output(type<ErrorRateStats>()),

  getCacheHitTrend: oc.input(usageQueryInputSchema).output(type<CacheHitTrend[]>()),

  getTokenStats: oc.input(usageQueryInputSchema).output(type<TokenStats[]>()),

  getCostEfficiencyTrend: oc.input(usageQueryInputSchema).output(type<CostEfficiencyPoint[]>()),

  getModelMix: oc.input(usageQueryInputSchema).output(type<ModelMixData[]>()),
};
