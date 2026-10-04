ALTER TABLE events ADD COLUMN endpoint_path TEXT;

CREATE INDEX IF NOT EXISTS idx_events_project_endpoint_created
  ON events(project_id, endpoint_path, received_at DESC);
