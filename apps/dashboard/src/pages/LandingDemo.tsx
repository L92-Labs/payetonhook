import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBase } from "../lib/api";

type DemoEvent = {
  id: string;
  method: string;
  received_at: string;
  body: string;
  path?: string;
  size?: number;
  contentType?: string;
};

const SLOT_KEY = "demo-slot";
const SLOT_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

const SAMPLE_PAYLOADS = [
  JSON.stringify(
    {
      id: "evt_1H7yQk2Z",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_3N4y5Z", amount: 4200, currency: "usd", status: "succeeded" } }
    },
    null,
    2
  ),
  JSON.stringify(
    {
      ref: "refs/heads/main",
      before: "0d1a26e67d8f5eaf",
      after: "f8c1b2a4d9e0",
      repository: { full_name: "acme/orders-api" },
      pusher: { name: "ada" },
      commits: [{ id: "f8c1b2a", message: "fix: clamp retry budget" }]
    },
    null,
    2
  ),
  JSON.stringify({ test: true, source: "payetonhook-demo", ts: Date.now() }, null, 2)
];

function ensureSlot(): string {
  try {
    const existing = sessionStorage.getItem(SLOT_KEY);
    if (existing && /^[a-z0-9]{6}$/.test(existing)) return existing;
  } catch {
    // sessionStorage unavailable — fall through to a fresh slot.
  }
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const slot = [...bytes].map((b) => SLOT_ALPHABET[b % SLOT_ALPHABET.length]).join("");
  try {
    sessionStorage.setItem(SLOT_KEY, slot);
  } catch {
    // Ignore — slot just won't persist.
  }
  return slot;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString([], { hour12: false });
}

function prettyBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function bodyPreview(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length > 400 ? `${oneLine.slice(0, 400)}…` : oneLine;
}

export default function LandingDemo() {
  const [slot] = useState(ensureSlot);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const payloadIndex = useRef(0);

  const ingressUrl = `${getApiBase()}/in/demo/${slot}`;
  const curlCommand = `curl -X POST ${ingressUrl} -H 'content-type: application/json' -d '{"type":"payment_intent.succeeded"}'`;

  const copy = useCallback((text: string, label: string) => {
    void navigator.clipboard.writeText(text).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(null), 1600);
  }, []);

  useEffect(() => {
    const source = new EventSource(`${getApiBase()}/demo/events/${slot}`);
    source.onopen = () => {
      setConnected(true);
      setReconnecting(false);
    };
    source.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data) as
          | { type: "snapshot"; events: DemoEvent[] }
          | { type: "event"; event: DemoEvent };
        if (parsed.type === "snapshot") {
          setEvents(parsed.events.slice(0, 8));
        } else {
          setEvents((prev) => [parsed.event, ...prev].slice(0, 8));
        }
      } catch {
        // Ignore malformed frames.
      }
    };
    source.onerror = () => {
      setConnected(false);
      setReconnecting(true);
    };
    return () => source.close();
  }, [slot]);

  const sendTestEvent = useCallback(async () => {
    setSending(true);
    const payload = SAMPLE_PAYLOADS[payloadIndex.current % SAMPLE_PAYLOADS.length];
    payloadIndex.current += 1;
    try {
      await fetch(ingressUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload
      });
    } catch {
      // The SSE stream is the source of truth; ignore POST failures here.
    } finally {
      setSending(false);
    }
  }, [ingressUrl]);

  return (
    <section className="landing-demo reveal-4" aria-label="Live webhook demo sandbox">
      <header className="landing-demo-head">
        <span className={`led ${connected ? "led-live" : ""}`} aria-hidden="true" />
        <span className="landing-demo-title">{connected ? "Live" : reconnecting ? "Reconnecting" : "Connecting"}</span>
        <span className="landing-demo-slot" title="Sandbox slot">{slot}</span>
        <span className="landing-demo-actions">
          <button
            type="button"
            className="ghost-btn landing-demo-send"
            onClick={() => copy(curlCommand, "curl")}
          >
            {copied === "curl" ? "Copied" : "Copy curl command"}
          </button>
          <button
            type="button"
            className="ghost-btn landing-demo-send"
            onClick={sendTestEvent}
            disabled={sending}
          >
            {sending ? "Sending…" : "Send test event"}
          </button>
        </span>
      </header>

      <div className="landing-demo-url">
        <code>{ingressUrl}</code>
        <button type="button" className="landing-demo-copy" onClick={() => copy(ingressUrl, "URL")}>
          {copied === "URL" ? "Copied" : "Copy"}
        </button>
      </div>

      <ul className="landing-demo-list" aria-live="polite">
        {events.length === 0 ? (
          <li className="landing-demo-empty">
            Waiting for your first webhook — hit Send test event or POST to the URL above.
          </li>
        ) : (
          events.map((event) => {
            const open = openId === event.id;
            return (
              <li key={event.id} className={`landing-demo-event ${open ? "open" : ""}`}>
                <button
                  type="button"
                  className="landing-demo-row"
                  onClick={() => setOpenId(open ? null : event.id)}
                  aria-expanded={open}
                >
                  <span className="led led-live" aria-hidden="true" />
                  <span className="landing-demo-id">{event.id}</span>
                  <time className="landing-demo-time">{formatTime(event.received_at)}</time>
                  <span className="chip">{event.method}</span>
                  <span className="landing-demo-body">{bodyPreview(event.body) || "—"}</span>
                  <span className="landing-demo-chevron" aria-hidden="true">{open ? "−" : "+"}</span>
                </button>
                {open ? (
                  <div className="landing-demo-detail">
                    <p className="landing-demo-detail-meta">
                      {event.path ?? "/in/demo"} · {event.size ?? event.body.length} bytes
                      {event.contentType ? ` · ${event.contentType}` : ""}
                    </p>
                    <pre>{prettyBody(event.body) || "—"}</pre>
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
      {reconnecting && <p className="landing-demo-reconnecting">live connection lost, retrying…</p>}

      <p className="landing-demo-note">
        Temporary sandbox · auto-expires in ~10 minutes · don&apos;t send secrets
      </p>
    </section>
  );
}
