import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";
import logger from "../utils/logger";

let db: SqlJsDatabase | null = null;

// ─── Debounced Write System ────────────────────────────────────────────────
// Instead of writing to disk on every single query, we batch writes
// with a debounce timer and periodic auto-saves.

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let isDirty = false;
const SAVE_DEBOUNCE_MS = 2000; // Wait 2s after last write before flushing to disk
const AUTO_SAVE_INTERVAL_MS = 30_000; // Auto-save every 30s regardless
let autoSaveInterval: ReturnType<typeof setInterval> | null = null;

function scheduleSave(): void {
  isDirty = true;

  // Clear any existing debounce timer
  if (saveTimer) clearTimeout(saveTimer);

  // Schedule a new save
  saveTimer = setTimeout(() => {
    flushToDisk();
  }, SAVE_DEBOUNCE_MS);
}

function flushToDisk(): void {
  if (!db || !isDirty) return;
  try {
    const dbPath = process.env.DATABASE_PATH || "./data/rezumate.db";
    const data = db.export();
    const buffer = Buffer.from(data);

    // Write to temp file first, then rename (atomic write)
    const tmpPath = dbPath + ".tmp";
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, dbPath);

    isDirty = false;
    logger.debug("Database flushed to disk");
  } catch (err: any) {
    logger.error(`Failed to flush database: ${err.message}`);
  }
}

// ─── Database Initialization ───────────────────────────────────────────────

export async function getDb(): Promise<SqlJsDatabase> {
  if (!db) {
    await initializeDatabase();
  }
  return db!;
}

export async function initializeDatabase(): Promise<void> {
  const dbPath = process.env.DATABASE_PATH || "./data/rezumate.db";
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    logger.info(`Database loaded from ${dbPath}`);
  } else {
    db = new SQL.Database();
    logger.info(`New database created at ${dbPath}`);
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      telegram_id INTEGER NOT NULL UNIQUE,
      username TEXT,
      first_name TEXT NOT NULL,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      preferences TEXT NOT NULL DEFAULT '{"language":"en","resumeFormat":"pdf","notificationsEnabled":true}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_activity_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      version_number INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      content_json TEXT NOT NULL,
      parsed_from TEXT NOT NULL,
      uploaded_file_name TEXT,
      ats_score REAL,
      linked_to_jd_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS job_descriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      company_name TEXT NOT NULL,
      job_title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_url TEXT,
      keyword_analysis TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS resume_versions (
      id TEXT PRIMARY KEY,
      resume_id TEXT NOT NULL REFERENCES resumes(id),
      version_number INTEGER NOT NULL,
      changes_summary TEXT NOT NULL,
      ats_score_before REAL,
      ats_score_after REAL,
      generated_for_jd_id TEXT,
      content_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL,
      approved_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS conversation_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      current_state TEXT NOT NULL DEFAULT 'IDLE',
      state_data TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS resume_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      industry TEXT,
      description TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS job_applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      jd_id TEXT NOT NULL REFERENCES job_descriptions(id),
      resume_id TEXT NOT NULL REFERENCES resumes(id),
      status TEXT NOT NULL DEFAULT 'draft',
      application_date TEXT,
      notes TEXT DEFAULT '',
      ats_score REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_resumes_active ON resumes(user_id, is_active)");
  db.run("CREATE INDEX IF NOT EXISTS idx_jd_user ON job_descriptions(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_conv_user_active ON conversation_sessions(user_id, is_active)");

  // Initial save after creating tables
  flushToDisk();
  isDirty = false;

  // Start auto-save interval
  if (autoSaveInterval) clearInterval(autoSaveInterval);
  autoSaveInterval = setInterval(() => {
    flushToDisk();
  }, AUTO_SAVE_INTERVAL_MS);

  logger.info("Database initialized successfully");
}

/**
 * Manually trigger a save. Uses debouncing by default.
 * Pass `immediate: true` to force an immediate flush.
 */
export function saveDb(immediate: boolean = false): void {
  if (immediate) {
    flushToDisk();
  } else {
    scheduleSave();
  }
}

/**
 * Graceful shutdown — flush any pending writes.
 * Call this on process exit.
 */
export function shutdownDb(): void {
  if (saveTimer) clearTimeout(saveTimer);
  if (autoSaveInterval) clearInterval(autoSaveInterval);
  flushToDisk();
  logger.info("Database shutdown complete");
}

// ─── Query Helpers ─────────────────────────────────────────────────────────

/** Run a query and return all rows as objects */
export async function queryAll(sql: string, params: any[] = []): Promise<any[]> {
  const database = await getDb();
  const stmt = database.prepare(sql);
  if (params.length > 0) stmt.bind(params);

  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/** Run a query and return first row */
export async function queryOne(sql: string, params: any[] = []): Promise<any | null> {
  const rows = await queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/** Run an insert/update/delete statement */
export async function execute(sql: string, params: any[] = []): Promise<void> {
  const database = await getDb();
  database.run(sql, params);
  scheduleSave(); // Debounced write instead of immediate flush
}

/**
 * Run multiple statements in a transaction.
 * All succeed or all fail.
 */
export async function transaction(operations: Array<{ sql: string; params: any[] }>): Promise<void> {
  const database = await getDb();

  database.run("BEGIN TRANSACTION");
  try {
    for (const op of operations) {
      database.run(op.sql, op.params);
    }
    database.run("COMMIT");
    scheduleSave();
  } catch (err) {
    database.run("ROLLBACK");
    throw err;
  }
}
