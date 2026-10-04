CREATE TABLE IF NOT EXISTS tunnel_attempts (
  id TEXT PRIMARY KEY,
  tunnel_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  target_url TEXT,
  device_label TEXT,
  source_ip TEXT,
  country TEXT,
  os TEXT,
  platform TEXT,
  success INTEGER NOT NULL DEFAULT 0,
  status_code INTEGER,
  error_message TEXT,
  duration_ms INTEGER,
  attempted_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_tunnel_attempts_event_attempted
  ON tunnel_attempts(event_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_tunnel_attempts_project_attempted
  ON tunnel_attempts(project_id, attempted_at DESC);
