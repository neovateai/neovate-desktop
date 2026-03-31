import Database from "better-sqlite3";
import debug from "debug";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { APP_DATA_DIR } from "../../core/app-paths";

const log = debug("neovate:stats-db");

const STATS_DB_PATH = join(APP_DATA_DIR, "stats.db");

let db: Database.Database | null = null;

const SCHEMA = `
-- Request events table (persisted from RequestTracker)
CREATE TABLE IF NOT EXISTS request_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  model TEXT,
  duration_ms INTEGER,
  status INTEGER,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  tool_names TEXT,
  error TEXT,
  stop_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_session ON request_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON request_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_model ON request_events(model);

-- Daily aggregated stats (for fast queries)
CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT PRIMARY KEY,
  total_cost_usd REAL DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cache_tokens INTEGER DEFAULT 0,
  request_count INTEGER DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  model_breakdown TEXT
);
`;

export function getStatsDb(): Database.Database {
  if (db) return db;

  mkdirSync(APP_DATA_DIR, { recursive: true });

  log("Opening stats database at %s", STATS_DB_PATH);
  db = new Database(STATS_DB_PATH);

  // Enable WAL mode for better concurrent read/write performance
  db.pragma("journal_mode = WAL");

  // Run schema
  db.exec(SCHEMA);

  log("Stats database initialized");
  return db;
}

export function closeStatsDb(): void {
  if (db) {
    log("Closing stats database");
    db.close();
    db = null;
  }
}

export function getStatsDbPath(): string {
  return STATS_DB_PATH;
}
