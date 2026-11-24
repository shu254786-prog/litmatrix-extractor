import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.resolve(__dirname, '../data');
export const PDF_DIR = path.join(DATA_DIR, 'pdfs');
export const DB_PATH = path.join(DATA_DIR, 'litmatrix.sqlite');

fs.mkdirSync(PDF_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    open_id TEXT NOT NULL,
    sync_code TEXT NOT NULL UNIQUE,
    nick_name TEXT NOT NULL,
    avatar_url TEXT NOT NULL DEFAULT '',
    is_guest INTEGER NOT NULL DEFAULT 0,
    login_mode TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    model TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'gemini',
    custom_base_url TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL,
    thinking_level TEXT NOT NULL,
    concurrency INTEGER NOT NULL DEFAULT 3,
    dimensions_json TEXT NOT NULL,
    custom_dimensions_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_owner_updated ON jobs(owner_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    page_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    error TEXT,
    duration_ms INTEGER,
    model_used TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    pdf_path TEXT,
    extraction_json TEXT,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_papers_job ON papers(job_id, sort_order ASC);
`);

// Safely migrate existing SQLite DBs without provider columns
const jobCols = db.prepare('PRAGMA table_info(jobs)').all() as Array<{ name: string }>;
if (!jobCols.some((c) => c.name === 'provider')) {
  db.exec(`ALTER TABLE jobs ADD COLUMN provider TEXT NOT NULL DEFAULT 'gemini'`);
}
if (!jobCols.some((c) => c.name === 'custom_base_url')) {
  db.exec(`ALTER TABLE jobs ADD COLUMN custom_base_url TEXT NOT NULL DEFAULT ''`);
}

// Recover any jobs/papers interrupted by a previous server shutdown
db.exec(`
  UPDATE jobs SET status = 'idle' WHERE status = 'running';
  UPDATE papers SET status = 'queued' WHERE status = 'extracting';
`);
