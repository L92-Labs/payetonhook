import type { AttemptRow, EventRow } from "./types";

export type DeadLetterEntry = {
  event: EventRow;
  failed: AttemptRow[];
  lastAttemptedAt: number;
};

export const DLQ_SCAN_LIMIT = 25;

type DeadLetterViewProps = {
  entries: DeadLetterEntry[];
  formatEventTimestamp: (ts: number) => string;
  isRefreshing: boolean;
  onOpenEvent: (eventId: string) => void;
  onRefresh: () => void;
  onReplayEvent: (eventId: string) => void;
  onRescan: () => void;
  scanning: boolean;
  scannedCount: number;
  timeAgo: (ts: number) => string;
  totalLoaded: number;
};

function targetLabel(attempt: AttemptRow): string {
  return attempt.destination_id ? `target ${attempt.destination_id.slice(0, 8)}` : "target";
}

export function DeadLetterView({
  entries,
  formatEventTimestamp,
  isRefreshing,
  onOpenEvent,
  onRefresh,
  onReplayEvent,
  onRescan,
  scanning,
  scannedCount,
  timeAgo,
  totalLoaded
}: DeadLetterViewProps) {
  return (
    <section className="project-utility-panel reveal-4" id="main-workspace">
      <div className="panel-header">
        <div>
          <h2>Dead letters</h2>
          <p className="panel-subtitle">
            Events whose latest delivery attempt to a forward target failed. Open one to inspect the payload and replay.
          </p>
        </div>
        <div className="header-inline-actions">
          <button className="ghost-btn" onClick={onRefresh} disabled={isRefreshing} type="button">
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button className="ghost-btn" onClick={onRescan} disabled={scanning} type="button">
            {scanning ? "Scanning…" : "Rescan"}
          </button>
        </div>
      </div>

      <p className="muted dlq-scope-note">
        Scan covers the newest {scannedCount} of {totalLoaded} loaded events (at most {DLQ_SCAN_LIMIT}).
      </p>

      {scanning && entries.length === 0 ? (
        <div className="resource-empty">
          <h3>Scanning recent events…</h3>
          <p className="muted">Checking delivery attempts of the newest events.</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="resource-empty">
          <h3>No dead letters</h3>
          <p className="muted">Every scanned event ended on a successful delivery. New failures appear here as they happen.</p>
        </div>
      ) : (
        <div className="resource-table">
          <div className="resource-table-head dlq-table-grid">
            <span>Event</span>
            <span>Failed target</span>
            <span>Endpoint</span>
            <span>Age</span>
            <span>Actions</span>
          </div>
          {entries.map((entry) => (
            <div key={entry.event.id} className="resource-row dlq-table-grid">
              <div className="resource-primary">
                <button className="inline-copy inline-copy-code" onClick={() => onOpenEvent(entry.event.id)} title={entry.event.id} type="button">
                  {entry.event.id}
                </button>
                <small>
                  {entry.event.replay === true ? "Replay" : "Live"} · {formatEventTimestamp(entry.event.received_at)}
                </small>
              </div>
              <div className="dlq-failures">
                {entry.failed.map((attempt) => (
                  <span key={attempt.id} className="dlq-failure" title={attempt.error_message ?? undefined}>
                    <span className="attempt-dot ko" />
                    <code>{attempt.status_code ?? "timeout"}</code>
                    <small>{attempt.error_message ?? "delivery failed"}</small>
                  </span>
                ))}
              </div>
              <code className="dlq-endpoint">/in/{entry.event.endpoint_path?.trim() || entry.event.project_slug}</code>
              <span className="dlq-age">
                {timeAgo(entry.lastAttemptedAt)}
                <small>{entry.failed.length} target{entry.failed.length === 1 ? "" : "s"} stuck</small>
              </span>
              <div className="resource-actions">
                <button className="ghost-btn" onClick={() => onOpenEvent(entry.event.id)} type="button">
                  Open event
                </button>
                <button className="primary-btn" onClick={() => onReplayEvent(entry.event.id)} type="button">
                  Replay
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
