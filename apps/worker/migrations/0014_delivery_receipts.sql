CREATE TABLE delivery_receipts (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('pending', 'delivered', 'exhausted')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  status_code INTEGER,
  error_message TEXT,
  PRIMARY KEY (event_id, destination_id)
);
