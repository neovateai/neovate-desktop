import type Database from "better-sqlite3";

import debug from "debug";

import type { RequestSummary } from "../../../shared/features/agent/request-types";
import type {
  ActivityDay,
  CostDataPoint,
  ModelStats,
  SummaryStats,
  TimeRange,
} from "../../../shared/features/stats/types";

import { getStatsDb } from "./database";

const log = debug("neovate:stats-service");

// Model pricing (USD per 1M tokens) - Anthropic official pricing
// Source: https://www.anthropic.com/pricing
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead?: number }> = {
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0, cacheRead: 0.3 },
  "claude-opus-4-20250514": { input: 15.0, output: 75.0, cacheRead: 1.5 },
  "claude-haiku-3-5-20241022": { input: 0.8, output: 4.0, cacheRead: 0.08 },
  // Legacy models
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0, cacheRead: 0.3 },
  "claude-3-opus-20240229": { input: 15.0, output: 75.0, cacheRead: 1.5 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25, cacheRead: 0.03 },
};

const DEFAULT_PRICING = { input: 3.0, output: 15.0, cacheRead: 0.3 };

function calculateCost(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
): number {
  const pricing = (model && MODEL_PRICING[model]) || DEFAULT_PRICING;
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const cacheCost = (cacheReadTokens / 1_000_000) * (pricing.cacheRead ?? 0);
  return inputCost + outputCost + cacheCost;
}

function getTimeRangeBounds(range: TimeRange): { start: number; end: number } {
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (range) {
    case "today":
      return { start: today.getTime(), end: now };

    case "week": {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Sunday
      return { start: weekStart.getTime(), end: now };
    }

    case "month": {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: monthStart.getTime(), end: now };
    }

    case "year": {
      const yearStart = new Date(today.getFullYear(), 0, 1);
      return { start: yearStart.getTime(), end: now };
    }

    default:
      return { start: today.getTime(), end: now };
  }
}

function getPreviousPeriodBounds(range: TimeRange): { start: number; end: number } {
  const { start, end } = getTimeRangeBounds(range);
  const duration = end - start;
  return { start: start - duration, end: start };
}

export class StatsService {
  private db: Database.Database;
  private insertStmt: Database.Statement;

  constructor() {
    this.db = getStatsDb();
    this.insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO request_events (
        id, session_id, timestamp, model, duration_ms, status,
        input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
        cost_usd, tool_names, error, stop_reason
      ) VALUES (
        @id, @sessionId, @timestamp, @model, @durationMs, @status,
        @inputTokens, @outputTokens, @cacheReadTokens, @cacheCreationTokens,
        @costUsd, @toolNames, @error, @stopReason
      )
    `);
  }

  persistRequest(summary: RequestSummary): void {
    // Only persist completed requests (phase === "end")
    if (summary.phase !== "end") return;

    const inputTokens = summary.usage?.inputTokens ?? 0;
    const outputTokens = summary.usage?.outputTokens ?? 0;
    const cacheReadTokens = summary.usage?.cacheReadInputTokens ?? 0;
    const cacheCreationTokens = summary.usage?.cacheCreationInputTokens ?? 0;
    const costUsd = calculateCost(summary.model, inputTokens, outputTokens, cacheReadTokens);

    try {
      this.insertStmt.run({
        id: summary.id,
        sessionId: summary.sessionId,
        timestamp: summary.timestamp,
        model: summary.model ?? null,
        durationMs: summary.duration ?? null,
        status: summary.status ?? null,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        costUsd,
        toolNames: summary.toolNames ? JSON.stringify(summary.toolNames) : null,
        error: summary.error ?? null,
        stopReason: summary.stopReason ?? null,
      });
      log("Persisted request %s cost=%.4f", summary.id.slice(0, 8), costUsd);
    } catch (err) {
      log("Failed to persist request %s: %s", summary.id.slice(0, 8), err);
    }
  }

  getSummaryStats(range: TimeRange): SummaryStats {
    const { start, end } = getTimeRangeBounds(range);
    const prev = getPreviousPeriodBounds(range);

    const currentStats = this.db
      .prepare(
        `
      SELECT
        COALESCE(SUM(cost_usd), 0) as totalCostUsd,
        COALESCE(SUM(input_tokens), 0) as inputTokens,
        COALESCE(SUM(output_tokens), 0) as outputTokens,
        COALESCE(SUM(cache_read_tokens), 0) as cacheTokens,
        COUNT(*) as requestCount,
        COUNT(DISTINCT session_id) as sessionCount,
        SUM(CASE WHEN error IS NOT NULL OR status >= 400 THEN 1 ELSE 0 END) as errorCount
      FROM request_events
      WHERE timestamp >= ? AND timestamp <= ?
    `,
      )
      .get(start, end) as {
      totalCostUsd: number;
      inputTokens: number;
      outputTokens: number;
      cacheTokens: number;
      requestCount: number;
      sessionCount: number;
      errorCount: number;
    };

    const prevStats = this.db
      .prepare(
        `
      SELECT COALESCE(SUM(cost_usd), 0) as totalCostUsd
      FROM request_events
      WHERE timestamp >= ? AND timestamp <= ?
    `,
      )
      .get(prev.start, prev.end) as { totalCostUsd: number };

    const costChangePercent =
      prevStats.totalCostUsd > 0
        ? ((currentStats.totalCostUsd - prevStats.totalCostUsd) / prevStats.totalCostUsd) * 100
        : 0;

    const totalTokens = currentStats.inputTokens + currentStats.outputTokens;
    const cacheHitRate =
      currentStats.inputTokens + currentStats.cacheTokens > 0
        ? (currentStats.cacheTokens / (currentStats.inputTokens + currentStats.cacheTokens)) * 100
        : 0;

    const errorRate =
      currentStats.requestCount > 0
        ? (currentStats.errorCount / currentStats.requestCount) * 100
        : 0;

    return {
      totalCostUsd: currentStats.totalCostUsd,
      costChangePercent,
      totalTokens,
      inputTokens: currentStats.inputTokens,
      outputTokens: currentStats.outputTokens,
      cacheTokens: currentStats.cacheTokens,
      cacheHitRate,
      requestCount: currentStats.requestCount,
      sessionCount: currentStats.sessionCount,
      errorRate,
    };
  }

  getCostTrend(range: TimeRange): CostDataPoint[] {
    const { start, end } = getTimeRangeBounds(range);

    // Determine grouping based on range
    let dateFormat: string;
    switch (range) {
      case "today":
        dateFormat = "%Y-%m-%d %H:00"; // Hourly
        break;
      case "week":
      case "month":
        dateFormat = "%Y-%m-%d"; // Daily
        break;
      case "year":
        dateFormat = "%Y-%m"; // Monthly
        break;
      default:
        dateFormat = "%Y-%m-%d";
    }

    const rows = this.db
      .prepare(
        `
      SELECT
        strftime('${dateFormat}', timestamp / 1000, 'unixepoch', 'localtime') as date,
        SUM(cost_usd) as cost,
        model
      FROM request_events
      WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY date, model
      ORDER BY date
    `,
      )
      .all(start, end) as { date: string; cost: number; model: string | null }[];

    // Aggregate by date with model breakdown
    const dateMap = new Map<string, { cost: number; modelBreakdown: Record<string, number> }>();

    for (const row of rows) {
      const existing = dateMap.get(row.date) ?? { cost: 0, modelBreakdown: {} };
      existing.cost += row.cost;
      if (row.model) {
        existing.modelBreakdown[row.model] = (existing.modelBreakdown[row.model] ?? 0) + row.cost;
      }
      dateMap.set(row.date, existing);
    }

    return Array.from(dateMap.entries()).map(([date, data]) => ({
      date,
      cost: data.cost,
      modelBreakdown: Object.keys(data.modelBreakdown).length > 0 ? data.modelBreakdown : undefined,
    }));
  }

  getModelBreakdown(range: TimeRange): ModelStats[] {
    const { start, end } = getTimeRangeBounds(range);

    const rows = this.db
      .prepare(
        `
      SELECT
        COALESCE(model, 'unknown') as model,
        COUNT(*) as requestCount,
        SUM(cost_usd) as totalCost,
        SUM(input_tokens + output_tokens) as totalTokens
      FROM request_events
      WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY model
      ORDER BY totalCost DESC
    `,
      )
      .all(start, end) as {
      model: string;
      requestCount: number;
      totalCost: number;
      totalTokens: number;
    }[];

    return rows.map((row) => ({
      model: row.model,
      requestCount: row.requestCount,
      totalCost: row.totalCost,
      totalTokens: row.totalTokens,
    }));
  }

  getActivityHeatmap(days: number = 365): ActivityDay[] {
    const end = Date.now();
    const start = end - days * 24 * 60 * 60 * 1000;

    const rows = this.db
      .prepare(
        `
      SELECT
        strftime('%Y-%m-%d', timestamp / 1000, 'unixepoch', 'localtime') as date,
        COUNT(*) as count
      FROM request_events
      WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY date
      ORDER BY date
    `,
      )
      .all(start, end) as { date: string; count: number }[];

    return rows.map((row) => ({
      date: row.date,
      count: row.count,
    }));
  }

  getRecentRequests(limit: number = 100): RequestSummary[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM request_events
      ORDER BY timestamp DESC
      LIMIT ?
    `,
      )
      .all(limit) as Array<{
      id: string;
      session_id: string;
      timestamp: number;
      model: string | null;
      duration_ms: number | null;
      status: number | null;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_creation_tokens: number;
      cost_usd: number;
      tool_names: string | null;
      error: string | null;
      stop_reason: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      phase: "end" as const,
      timestamp: row.timestamp,
      turnIndex: 0,
      url: "",
      method: "POST",
      headers: {},
      model: row.model ?? undefined,
      duration: row.duration_ms ?? undefined,
      status: row.status ?? undefined,
      usage: {
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cacheReadInputTokens: row.cache_read_tokens,
        cacheCreationInputTokens: row.cache_creation_tokens,
      },
      toolNames: row.tool_names ? JSON.parse(row.tool_names) : undefined,
      error: row.error ?? undefined,
      stopReason: row.stop_reason ?? undefined,
    }));
  }
}

let instance: StatsService | null = null;

export function getStatsService(): StatsService {
  if (!instance) {
    instance = new StatsService();
  }
  return instance;
}
