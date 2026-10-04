ALTER TABLE project_endpoints ADD COLUMN forward_url TEXT;

ALTER TABLE destinations ADD COLUMN endpoint_path TEXT;
ALTER TABLE destinations ADD COLUMN managed_by_endpoint INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_destinations_project_endpoint_active
  ON destinations(project_id, endpoint_path, active, created_at);
