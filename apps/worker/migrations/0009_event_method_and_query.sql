ALTER TABLE events ADD COLUMN request_method TEXT NOT NULL DEFAULT 'POST';
ALTER TABLE events ADD COLUMN request_query_json TEXT;

CREATE INDEX IF NOT EXISTS idx_events_project_method_created
  ON events(project_id, request_method, received_at DESC);
