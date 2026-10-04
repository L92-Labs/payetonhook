import type { AttemptRow, EventPageInfo, EventRow, TunnelAttemptRow } from "./types";

type TriageViewProps = {
  attempts: AttemptRow[];
  deadLettersCount: number;
  density: "comfortable" | "compact";
  eventEndpointPath: string | null;
  eventMethod: string;
  eventQueryParams: Record<string, string | string[]>;
  eventReplay: boolean;
  eventTunnels: TunnelAttemptRow[];
  events: EventRow[];
  eventsPageInfo: EventPageInfo;
  filteredEvents: EventRow[];
  formatEventTimestamp: (ts: number) => string;
  isLoadingDetail: boolean;
  isLoadingMoreEvents: boolean;
  isRefreshing: boolean;
  latestEvent: EventRow | null;
  onCopyText: (text: string, label: string) => void;
  onLoadMore: () => void;
  onReplayEvent: () => void;
  onResetFilters?: () => void;
  onSelectEvent: (eventId: string) => void;
  prettyPayload: string;
  selectedEvent: string | null;
  selectedEventRow: EventRow | null;
  timeAgo: (ts: number) => string;
  endpointPathForEvent: (event: Pick<EventRow, "endpoint_path" | "project_slug">) => string;
  countryFlag: (country: string | null) => string | null;
};

export function TriageView({
  attempts,
  deadLettersCount,
  density,
  eventEndpointPath,
  eventMethod,
  eventQueryParams,
  eventReplay,
  eventTunnels,
  events,
  eventsPageInfo,
  filteredEvents,
  formatEventTimestamp,
  isLoadingDetail,
  isLoadingMoreEvents,
  isRefreshing,
  latestEvent,
  onCopyText,
  onLoadMore,
  onReplayEvent,
  onResetFilters,
  onSelectEvent,
  prettyPayload,
  selectedEvent,
  selectedEventRow,
  timeAgo,
  endpointPathForEvent,
  countryFlag
}: TriageViewProps) {
  return (
    <section className="triage-layout" id="main-workspace">
      <aside className="events-panel reveal-4">
        <div className="panel-header">
          <div>
            <h2>Event Stream</h2>
            <p className="panel-subtitle">Newest deliveries first.</p>
          </div>
          <span className="stream-count-chip">{filteredEvents.length} visible</span>
        </div>
        {latestEvent ? (
          <div className="stream-highlight compact">
            <p>Latest ingress</p>
            <strong>{timeAgo(latestEvent.received_at)}</strong>
            <small>{formatEventTimestamp(latestEvent.received_at)}</small>
          </div>
        ) : null}
        <ul className={`event-list ${density}`}>
          {isRefreshing && events.length === 0
            ? Array.from({ length: 6 }).map((_, index) => <li key={index}><div className="skeleton-row" /></li>)
            : filteredEvents.length === 0 ? (
              <li>
                <div className="empty-state subtle">
                  <h3>{events.length === 0 ? "Stream is quiet" : "No matching events"}</h3>
                  <p className="muted">
                    {events.length === 0
                      ? "POST to the ingress URL above and the event will land here instantly."
                      : "Filters are hiding every event in this window."}
                  </p>
                  {events.length > 0 && onResetFilters ? (
                    <span className="empty-state-actions">
                      <button className="ghost-btn" onClick={onResetFilters} type="button">
                        Reset filters
                      </button>
                    </span>
                  ) : null}
                </div>
              </li>
            )
            : filteredEvents.map((event) => (
              <li key={event.id}>
                <button
                  className={`event-item ${density} ${selectedEvent === event.id ? "active" : ""}`}
                  onClick={() => onSelectEvent(event.id)}
                  type="button"
                  title={event.id}
                >
                  <div className="event-title-row">
                    <strong className="event-id">{event.id}</strong>
                    <div className="event-badges">
                      {event.replay === true
                        ? <span className="chip replay">Replay</span>
                        : <span className="chip live">Live</span>}
                      <span className="chip">{(event.request_method ?? "POST").toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="event-meta-row">
                    <span className="event-slug">proj/{event.project_slug}</span>
                    <span className="event-endpoint" title={`/in/${endpointPathForEvent(event)}`}>/in/{endpointPathForEvent(event)}</span>
                    <span className="event-time" title={formatEventTimestamp(event.received_at)}>
                      {timeAgo(event.received_at)}
                    </span>
                    <span className="event-time event-time-absolute" title={formatEventTimestamp(event.received_at)}>
                      {formatEventTimestamp(event.received_at)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
        </ul>
        <div className="event-list-footer">
          {eventsPageInfo.hasMore ? (
            <button
              className="ghost-btn"
              onClick={onLoadMore}
              disabled={isLoadingMoreEvents || isRefreshing}
            >
              {isLoadingMoreEvents ? "Loading…" : "Load more"}
            </button>
          ) : events.length > 0 ? (
            <span className="muted">End of stream</span>
          ) : null}
        </div>
      </aside>

      <section className="detail-panel reveal-5">
        <div className="panel-header">
          <div>
            <h2>Event Detail</h2>
            <p className="panel-subtitle">Payload, delivery attempts, and local forwarding.</p>
          </div>
          {selectedEvent ? (
            <button className="primary-btn" onClick={onReplayEvent}>
              Replay
            </button>
          ) : null}
        </div>

        {selectedEvent ? (
          <>
            <div className="detail-hero">
              <div className="detail-id-row">
                <span>Selected event</span>
                <button
                  className="inline-copy"
                  onClick={() => onCopyText(selectedEvent, "Event ID")}
                  title="Copy event ID"
                  type="button"
                >
                  {selectedEvent}
                </button>
              </div>
              <div className="detail-chip-row">
                <span className={`chip ${eventReplay || selectedEventRow?.replay === true ? "replay" : "live"}`}>
                  {eventReplay || selectedEventRow?.replay === true ? "Replay" : "Incoming"}
                </span>
                <span className="chip">{eventMethod}</span>
                <span className="detail-chip subtle">{selectedEventRow ? formatEventTimestamp(selectedEventRow.received_at) : "Loading timestamp…"}</span>
              </div>
            </div>

            <div className="detail-meta">
              <p className="detail-meta-card">
                <span>Project</span>
                <strong>{selectedEventRow?.project_slug ?? "unknown"}</strong>
              </p>
              <p className="detail-meta-card detail-meta-card-wide">
                <span>Endpoint</span>
                <strong>/in/{selectedEventRow ? endpointPathForEvent(selectedEventRow) : eventEndpointPath ?? "unknown"}</strong>
              </p>
              <p className="detail-meta-card">
                <span>Method</span>
                <strong>{eventMethod}</strong>
              </p>
              <p className="detail-meta-card">
                <span>Stream</span>
                <strong>{eventReplay || selectedEventRow?.replay === true ? "Replay" : "Incoming"}</strong>
              </p>
            </div>

            {eventMethod === "GET" ? (
              <section className="detail-section">
                <div className="detail-section-head">
                  <h3>URL Params</h3>
                </div>
                <ul className="attempt-list">
                  {Object.keys(eventQueryParams).length ? (
                    Object.entries(eventQueryParams).map(([key, value]) => (
                      <li key={key}>
                        <span className="attempt-dot ok" />
                        <strong>{key}</strong>
                        <span style={{ gridColumn: "3 / -1" }}>
                          {Array.isArray(value) ? value.join(", ") : value}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li>
                      <span className="attempt-dot" />
                      <strong>–</strong>
                      <span style={{ gridColumn: "3 / -1" }}>No URL params.</span>
                    </li>
                  )}
                </ul>
              </section>
            ) : (
              <section className="detail-section">
                <div className="detail-section-head">
                  <h3>Payload</h3>
                </div>
                {isLoadingDetail ? (
                  <div className="payload-skeleton" aria-hidden="true">
                    <div className="skeleton-line" />
                    <div className="skeleton-line w-60" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line w-40" />
                    <div className="skeleton-line" />
                  </div>
                ) : (
                  <pre className="payload-box">{prettyPayload}</pre>
                )}
              </section>
            )}

            <section className="detail-section">
              <div className="detail-section-head">
                <h3>Delivery Attempts</h3>
                {deadLettersCount > 0 ? <span className="section-status danger">{deadLettersCount} failed</span> : null}
              </div>
              <ul className="attempt-list">
                {isLoadingDetail && attempts.length === 0 ? (
                  Array.from({ length: 2 }).map((_, index) => (
                    <li key={index} aria-hidden="true">
                      <span className="attempt-dot" />
                      <span className="skeleton-line" style={{ width: "100%" }} />
                    </li>
                  ))
                ) : attempts.length ? (
                  attempts.map((attempt) => (
                    <li key={attempt.id}>
                      <span className={`attempt-dot ${attempt.success === 1 ? "ok" : "ko"}`} />
                      <strong>#{attempt.attempt_no}</strong>
                      <span>{attempt.success === 1 ? "Delivered" : "Failed"}</span>
                      <span>{attempt.status_code ?? "timeout"}</span>
                      <small>{attempt.error_message ?? ""}</small>
                    </li>
                  ))
                ) : (
                  <li>
                    <span className="attempt-dot" />
                    <strong>–</strong>
                    <span style={{ gridColumn: "3 / -1" }}>No delivery attempts recorded yet.</span>
                  </li>
                )}
              </ul>
            </section>

            <section className="detail-section">
              <div className="detail-section-head">
                <h3>Tunnel Forwarding</h3>
              </div>
              <ul className="attempt-list">
                {eventTunnels.length ? (
                  eventTunnels.map((attempt, index) => (
                    <li key={`${attempt.tunnel_id}-${attempt.attempted_at}-${index}`}>
                      <span className={`attempt-dot ${attempt.success === 1 ? "ok" : "ko"}`} />
                      <strong>{attempt.device_label || attempt.tunnel_id.slice(0, 8)}</strong>
                      <span>{attempt.success === 1 ? "Forwarded" : "Failed"}</span>
                      <span>{attempt.status_code ?? "local error"}</span>
                      <small>
                        {[
                          attempt.source_ip,
                          attempt.country ? `${countryFlag(attempt.country) ?? ""} ${attempt.country}`.trim() : null,
                          attempt.os,
                          attempt.platform
                        ]
                          .filter(Boolean)
                          .join(" · ") ||
                          attempt.target_url || ""}
                      </small>
                    </li>
                  ))
                ) : (
                  <li>
                    <span className="attempt-dot" />
                    <strong>–</strong>
                    <span style={{ gridColumn: "3 / -1" }}>No tunnel forwards for this event.</span>
                  </li>
                )}
              </ul>
            </section>
          </>
        ) : (
          <div className="empty-state">
            <h3>Nothing selected</h3>
            <p className="muted">Choose an event on the left to inspect payload, delivery history, and replay actions.</p>
          </div>
        )}
      </section>
    </section>
  );
}
