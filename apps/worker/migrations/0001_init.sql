CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  signing_secret TEXT,
  retention_days INTEGER NOT NULL DEFAULT 1,
  plan_tier TEXT NOT NULL DEFAULT 'free',
  shard_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS destinations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  headers_json TEXT,
  condition_expr TEXT,
  transform_code TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  timeout_ms INTEGER NOT NULL DEFAULT 5000,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_headers_json TEXT NOT NULL,
  source_ip TEXT,
  replay_of_event_id TEXT,
  received_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (replay_of_event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS delivery_attempts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  destination_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  status_code INTEGER,
  success INTEGER NOT NULL DEFAULT 0,
  response_body_key TEXT,
  error_message TEXT,
  attempted_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (destination_id) REFERENCES destinations(id)
);

CREATE TABLE IF NOT EXISTS replays (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS usage_counters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  events_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, month_key),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_events_project_created ON events(project_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_event_attempt ON delivery_attempts(event_id, attempt_no);
CREATE INDEX IF NOT EXISTS idx_destinations_project ON destinations(project_id, active, created_at);
