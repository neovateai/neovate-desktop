import { implement } from "@orpc/server";

import { contract } from "../../../shared/contract";
import { getStatsService } from "./stats-service";

const os = implement(contract.stats);

export const statsRouter = {
  getSummary: os.getSummary.handler(({ input }) => {
    return getStatsService().getSummaryStats(input.range);
  }),

  getCostTrend: os.getCostTrend.handler(({ input }) => {
    return getStatsService().getCostTrend(input.range);
  }),

  getModelBreakdown: os.getModelBreakdown.handler(({ input }) => {
    return getStatsService().getModelBreakdown(input.range);
  }),

  getActivityHeatmap: os.getActivityHeatmap.handler(({ input }) => {
    return getStatsService().getActivityHeatmap(input.days);
  }),
};
