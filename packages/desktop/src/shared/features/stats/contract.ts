import { oc, type } from "@orpc/contract";
import { z } from "zod";

import type { ActivityDay, CostDataPoint, ModelStats, SummaryStats } from "./types";

export const timeRangeSchema = z.enum(["today", "week", "month", "year"]);

export const statsContract = {
  getSummary: oc.input(z.object({ range: timeRangeSchema })).output(type<SummaryStats>()),

  getCostTrend: oc.input(z.object({ range: timeRangeSchema })).output(type<CostDataPoint[]>()),

  getModelBreakdown: oc.input(z.object({ range: timeRangeSchema })).output(type<ModelStats[]>()),

  getActivityHeatmap: oc
    .input(z.object({ days: z.number().optional() }))
    .output(type<ActivityDay[]>()),
};
