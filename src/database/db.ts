import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";
import logger from "../utils/logger";

let db: SqlJsDatabase | null = null;

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

  saveDb();
  logger.info("Database initialized successfully");
}

export function saveDb(): void {
  if (!db) return;
  const dbPath = process.env.DATABASE_PATH || "./data/rezumate.db";
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

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
  saveDb();
}
