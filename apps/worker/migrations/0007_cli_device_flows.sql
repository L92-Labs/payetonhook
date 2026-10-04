CREATE TABLE IF NOT EXISTS cli_device_flows (
  device_code TEXT PRIMARY KEY,
  user_code TEXT NOT NULL UNIQUE,
  requested_project_slug TEXT,
  selected_project_id TEXT,
  selected_project_slug TEXT,
  status TEXT NOT NULL,
  approved_by_user_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  approved_at INTEGER,
  consumed_at INTEGER,
  last_polled_at INTEGER,
  FOREIGN KEY (selected_project_id) REFERENCES projects(id),
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_cli_device_flows_status_expires
  ON cli_device_flows(status, expires_at);
