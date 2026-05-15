-- D1: standard_clauses (wrangler binding: contract_db)
-- 실행: wrangler d1 execute contract-db --remote --file=scripts/migrations/001_standard_clauses.sql

CREATE TABLE IF NOT EXISTS standard_clauses (
  id TEXT PRIMARY KEY,
  contract_type TEXT NOT NULL,
  main_category TEXT,
  sub_category TEXT,
  detail_category TEXT,
  article_no INTEGER,
  labels TEXT NOT NULL,
  content TEXT NOT NULL,
  service_type_id TEXT NOT NULL,
  service_type_label TEXT,
  document_name TEXT,
  source_zip TEXT,
  source_file TEXT,
  split TEXT CHECK (split IN ('Training', 'Validation', 'Unknown')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_clauses_service_type
  ON standard_clauses (service_type_id);

CREATE INDEX IF NOT EXISTS idx_clauses_contract_type
  ON standard_clauses (contract_type);

CREATE INDEX IF NOT EXISTS idx_clauses_split
  ON standard_clauses (split);
