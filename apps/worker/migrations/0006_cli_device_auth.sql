CREATE TABLE IF NOT EXISTS cli_device_auth (
  device_code TEXT PRIMARY KEY,
  user_code TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  status TEXT NOT NULL,
  approved_by_user_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  approved_at INTEGER,
  consumed_at INTEGER,
  last_polled_at INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_cli_device_auth_status_expires
  ON cli_device_auth(status, expires_at);
