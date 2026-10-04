ALTER TABLE projects ADD COLUMN updated_at INTEGER;
ALTER TABLE projects ADD COLUMN archived_at INTEGER;
ALTER TABLE delivery_attempts ADD COLUMN duration_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_destination_attempted_at ON delivery_attempts(destination_id, attempted_at);
CREATE INDEX IF NOT EXISTS idx_delivery_attempts_event_attempted_at ON delivery_attempts(event_id, attempted_at);
CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(archived_at, created_at);
