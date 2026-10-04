// DEMO-ONLY: fixture backend for design previews (VITE_DEMO=1).
// Strictly env-gated from src/lib/api.ts; never bundled into behaviour when the
// flag is absent (the flag compiles to `false` and the demo branch is dead code
// that tree-shakes away). No network, no secrets, no auth: /api/me returns a
// fixture user so the auth gate passes and Google login is never touched.

import type {
  ApiKeyRow,
  AttemptRow,
  EventPageInfo,
  EventRow,
  ProjectEndpointRow,
  ProjectRow,
  TunnelAttemptRow,
  TunnelConnection
} from "../pages/dashboard/types";

type Store = {
  projects: ProjectRow[];
  endpoints: ProjectEndpointRow[];
  events: EventRow[];
  attemptsByEvent: Map<string, AttemptRow[]>;
  tunnelsByEvent: Map<string, TunnelAttemptRow[]>;
  payloadsByEvent: Map<string, string>;
  keys: ApiKeyRow[];
  keyTokens: Map<string, string>;
  keyProjects: Map<string, string>;
  tunnels: TunnelConnection[];
};

function makeId(prefix: string): string {
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}-${random}${Date.now().toString(16).slice(-6)}`;
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const NOW = Date.now();

const payloads = {
  stripe: (id: string) =>
    JSON.stringify(
      {
        id: `evt_${id.slice(2, 14)}`,
        object: "event",
        api_version: "2024-06-20",
        created: Math.floor(NOW / 1000) - 42,
        type: "charge.succeeded",
        data: {
          object: {
            id: `ch_${id.slice(4, 18)}`,
            amount: 4900,
            currency: "eur",
            customer: "cus_9X2fLm",
            payment_method: "pm_card_visa",
            status: "succeeded"
          }
        }
      },
      null,
      2
    ),
  github: () =>
    JSON.stringify(
      {
        ref: "refs/heads/main",
        before: "6d1c8b4f0a2e3b5c7d9e1f2a3b4c5d6e7f8a9b0c",
        after: "b3a5e7c9d1f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0",
        repository: {
          id: 428_991_772,
          full_name: "l92-labs/payetonhook",
          default_branch: "main"
        },
        pusher: { name: "loiu92", email: "loiu92@gmail.com" },
        commits: [
          { id: "b3a5e7c9d1f2a4b", message: "fix(dashboard): clamp retry backoff", author: { name: "loiu92" } },
          { id: "c4b6d8e0f2a4b6c", message: "chore(worker): bump queue concurrency", author: { name: "loiu92" } }
        ]
      },
      null,
      2
    ),
  email: (subject: string) =>
    JSON.stringify({ to: "ae@lucasruelle.fr", subject, template: "order_shipped", locale: "fr-FR", vars: { order: "1843" } }, null, 2),
  alert: (severity: string) =>
    JSON.stringify({ service: "checkout-api", severity, incident_key: "i-9f2", summary: "p99 latency above 800ms" }, null, 2),
  generic: (tag: string) => JSON.stringify({ event: tag, ok: true, source: "ci-pipeline", run: 4211 }, null, 2)
};

function attemptsFor(kind: "delivered" | "retried" | "dead" | "replayed", base: number, destinationId: string): AttemptRow[] {
  const mk = (attemptNo: number, success: boolean, statusCode: number | null, error: string | null, offsetMs: number): AttemptRow => ({
    id: makeId("att"),
    destination_id: destinationId,
    attempt_no: attemptNo,
    status_code: statusCode,
    success: success ? 1 : 0,
    error_message: error,
    attempted_at: base + offsetMs,
    duration_ms: success ? 90 + Math.floor(Math.random() * 260) : 4900 + Math.floor(Math.random() * 900)
  });
  switch (kind) {
    case "delivered":
      return [mk(1, true, 200, null, 400)];
    case "replayed":
      return [mk(1, true, 201, null, 250)];
    case "retried":
      return [mk(1, false, 500, "non-2xx: 500", 600), mk(2, true, 200, null, 6400)];
    case "dead":
      return [
        mk(1, false, 500, "non-2xx: 500", 500),
        mk(2, false, 503, "non-2xx: 503", 6300),
        mk(3, false, 504, "non-2xx: 504", 12_800),
        mk(4, false, null, "max retries exhausted", 25_600)
      ];
  }
}

function seedStore(): Store {
  const store: Store = {
    projects: [
      {
        id: "prj-checkout",
        slug: "checkout",
        name: "Checkout Prod",
        retention_days: 7,
        plan_tier: "pro",
        primary_forward_url: "https://ops.internal/hooks/checkout"
      },
      { id: "prj-notify", slug: "notifications", name: "Notifications", retention_days: 3, plan_tier: "free" },
      { id: "prj-sandbox", slug: "sandbox", name: "Sandbox", retention_days: 1, plan_tier: "free" }
    ],
    endpoints: [
      {
        id: "ept-stripe",
        project_id: "prj-checkout",
        name: "Stripe alt route",
        path: "checkout-stripe",
        forward_url: "https://billing.internal/stripe",
        active: 1,
        created_at: NOW - 40 * DAY,
        updated_at: NOW - 6 * DAY
      },
      {
        id: "ept-qa",
        project_id: "prj-checkout",
        name: "QA mirror",
        path: "checkout-qa",
        forward_url: null,
        active: 1,
        created_at: NOW - 18 * DAY,
        updated_at: NOW - 18 * DAY
      },
      {
        id: "ept-emails",
        project_id: "prj-notify",
        name: "Email events",
        path: "notify-emails",
        forward_url: "https://mailer.internal/hooks",
        active: 1,
        created_at: NOW - 25 * DAY,
        updated_at: NOW - 25 * DAY
      }
    ],
    events: [],
    attemptsByEvent: new Map(),
    tunnelsByEvent: new Map(),
    payloadsByEvent: new Map(),
    keys: [
      { id: "key-ops", label: "ops-laptop", created_at: NOW - 62 * DAY, revoked_at: null, fingerprint: "f3a91c07d2e4b6185a77c0" },
      { id: "key-ci", label: "ci-runner", created_at: NOW - 20 * DAY, revoked_at: NOW - 2 * DAY, fingerprint: "9b2e64f1a08c3d75e2bb41" },
      { id: "key-notify", label: "Default", created_at: NOW - 25 * DAY, revoked_at: null, fingerprint: "51cc7e93b0af4d268e0f13" },
      { id: "key-sbx", label: "scratch", created_at: NOW - 4 * DAY, revoked_at: null, fingerprint: "c70a2f59d1be48093ac6f2" }
    ],
    keyTokens: new Map(),
    keyProjects: new Map([
      ["key-ops", "prj-checkout"],
      ["key-ci", "prj-checkout"],
      ["key-notify", "prj-notify"],
      ["key-sbx", "prj-sandbox"]
    ]),
    tunnels: [
      {
        id: "tnl-live-01",
        projectSlug: "notifications",
        workerUrl: "https://api.payetonhook.l92-labs.com",
        targetUrl: "http://localhost:3000/webhook",
        deviceLabel: "macbook-pro",
        hostname: "marc-mbp.local",
        os: "darwin 24.5.0",
        platform: "darwin",
        nodeVersion: "v24.3.0",
        sourceIp: "82.64.19.7",
        country: "FR",
        connectedAt: NOW - 3 * HOUR,
        lastActivity: NOW - 4 * 60_000,
        eventsForwarded: 148,
        deliveriesOk: 143,
        deliveriesFailed: 5,
        success24h: 143,
        failed24h: 5,
        lastError: "connect ECONNREFUSED 127.0.0.1:3000",
        status: "live"
      },
      {
        id: "tnl-idle-02",
        projectSlug: "checkout",
        workerUrl: "https://api.payetonhook.l92-labs.com",
        targetUrl: "http://localhost:5173/api/hook",
        deviceLabel: "thinkpad-x1",
        hostname: "lucas-thinkpad",
        os: "linux 6.9.7",
        platform: "linux",
        nodeVersion: "v22.4.0",
        sourceIp: "92.11.203.4",
        country: "BE",
        connectedAt: NOW - 30 * HOUR,
        lastActivity: NOW - 9 * HOUR,
        eventsForwarded: 12,
        deliveriesOk: 12,
        deliveriesFailed: 0,
        success24h: 3,
        failed24h: 0,
        lastError: null,
        status: "idle"
      }
    ]
  };

  type Seedling = {
    project: "checkout" | "notifications" | "sandbox";
    path?: string;
    method?: string;
    query?: Record<string, string | string[]>;
    ageHours: number;
    kind: "delivered" | "retried" | "dead" | "replayed";
    payload: string;
    replayOf?: string;
  };

  const seedlings: Seedling[] = [
    { project: "checkout", ageHours: 0.2, kind: "delivered", payload: payloads.stripe(makeId("evt")) },
    { project: "checkout", ageHours: 0.9, kind: "retried", payload: payloads.alert("warning") },
    { project: "checkout", path: "checkout-stripe", ageHours: 1.6, kind: "delivered", payload: payloads.stripe(makeId("evt")) },
    { project: "checkout", ageHours: 2.4, kind: "dead", payload: payloads.alert("critical") },
    { project: "checkout", ageHours: 3.1, kind: "delivered", payload: payloads.github() },
    { project: "checkout", path: "checkout-qa", ageHours: 4.8, kind: "delivered", payload: payloads.generic("qa-probe") },
    { project: "checkout", ageHours: 6.5, kind: "dead", payload: payloads.stripe(makeId("evt")) },
    { project: "checkout", ageHours: 8.2, kind: "delivered", payload: payloads.stripe(makeId("evt")) },
    { project: "checkout", ageHours: 11.0, kind: "retried", payload: payloads.alert("warning") },
    { project: "checkout", ageHours: 22.5, kind: "delivered", payload: payloads.github() },
    { project: "checkout", ageHours: 27.3, kind: "delivered", payload: payloads.stripe(makeId("evt")) },
    { project: "checkout", ageHours: 30.9, kind: "replayed", payload: payloads.stripe(makeId("evt")), replayOf: "older" },
    { project: "checkout", ageHours: 45.6, kind: "delivered", payload: payloads.generic("deploy") },
    { project: "checkout", ageHours: 52.1, kind: "delivered", payload: payloads.stripe(makeId("evt")) },
    { project: "checkout", path: "checkout-stripe", ageHours: 68.8, kind: "retried", payload: payloads.stripe(makeId("evt")) },
    { project: "checkout", ageHours: 96.4, kind: "delivered", payload: payloads.github() },
    { project: "notifications", ageHours: 0.5, kind: "delivered", payload: payloads.email("Your order has shipped") },
    { project: "notifications", path: "notify-emails", ageHours: 1.3, kind: "retried", payload: payloads.email("Password changed") },
    { project: "notifications", ageHours: 2.9, kind: "dead", payload: payloads.email("Invoice 1843") },
    { project: "notifications", ageHours: 5.4, kind: "delivered", payload: payloads.email("Welcome aboard") },
    { project: "notifications", ageHours: 9.7, kind: "delivered", payload: payloads.email("Your order has shipped") },
    { project: "notifications", ageHours: 16.2, kind: "delivered", payload: payloads.generic("digest") },
    { project: "notifications", ageHours: 26.0, kind: "retried", payload: payloads.email("Payment receipt") },
    { project: "notifications", ageHours: 38.5, kind: "delivered", payload: payloads.email("Welcome aboard") },
    { project: "notifications", ageHours: 61.8, kind: "delivered", payload: payloads.generic("digest") },
    { project: "sandbox", method: "GET", query: { verify: "1", source: ["stripe", "github"] }, ageHours: 0.7, kind: "delivered", payload: payloads.generic("healthcheck") },
    { project: "sandbox", ageHours: 3.4, kind: "delivered", payload: payloads.generic("smoke") },
    { project: "sandbox", method: "GET", query: { challenge: "abc123" }, ageHours: 7.8, kind: "delivered", payload: payloads.generic("healthcheck") },
    { project: "sandbox", ageHours: 12.6, kind: "retried", payload: payloads.generic("smoke") },
    { project: "sandbox", ageHours: 21.3, kind: "delivered", payload: payloads.generic("deploy") }
  ];

  const destinationByProject: Record<string, string> = {
    checkout: "fwd-ops-01",
    notifications: "fwd-mailer-02",
    sandbox: "fwd-default-03"
  };

  const seeded = seedlings.map((seedling) => {
    const project = store.projects.find((p) => p.slug === seedling.project)!;
    const receivedAt = NOW - Math.round(seedling.ageHours * HOUR);
    const eventId = makeId("evt");
    const event: EventRow = {
      id: eventId,
      project_id: project.id,
      project_slug: project.slug,
      endpoint_path: seedling.path ?? null,
      replay: seedling.kind === "replayed",
      r2_key: `events/${project.slug}/${eventId}.json`,
      replay_of_event_id: seedling.replayOf ? makeId("evt") : null,
      request_method: seedling.method ?? "POST",
      received_at: receivedAt
    };
    store.events.push(event);
    store.payloadsByEvent.set(eventId, seedling.payload);
    const attempts = attemptsFor(seedling.kind, receivedAt, destinationByProject[project.slug]);
    store.attemptsByEvent.set(eventId, attempts);
    if (project.slug === "notifications" && seedling.ageHours < 6) {
      const tunnelForwardOk = seedling.kind !== "dead";
      store.tunnelsByEvent.set(eventId, [
        {
          tunnel_id: "tnl-live-01",
          target_url: "http://localhost:3000/webhook",
          device_label: "macbook-pro",
          source_ip: "82.64.19.7",
          country: "FR",
          os: "darwin 24.5.0",
          platform: "darwin",
          success: tunnelForwardOk ? 1 : 0,
          status_code: tunnelForwardOk ? 200 : null,
          error_message: tunnelForwardOk ? null : "connect ECONNREFUSED 127.0.0.1:3000",
          duration_ms: tunnelForwardOk ? 42 + Math.floor(Math.random() * 80) : 5000,
          attempted_at: receivedAt + 300
        }
      ]);
    }
    return event;
  });

  // Give the replayed event an honest lineage: point at an older event id.
  const replayTarget = seeded.find((event) => event.project_slug === "checkout" && event.received_at < NOW - 40 * HOUR);
  const replayEvent = seeded.find((event) => event.replay === true);
  if (replayEvent && replayTarget) {
    replayEvent.replay_of_event_id = replayTarget.id;
  }

  store.events.sort((a, b) => b.received_at - a.received_at);
  return store;
}

const store = seedStore();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function windowStart(windowPreset: string): number {
  if (windowPreset === "24h") return NOW - DAY;
  if (windowPreset === "30d") return NOW - 30 * DAY;
  return NOW - 7 * DAY;
}

function statusBucket(code: number | null): "http_2xx" | "http_4xx" | "http_5xx" | "timeout_or_network" {
  if (code === null) return "timeout_or_network";
  if (code < 300) return "http_2xx";
  if (code < 500) return "http_4xx";
  return "http_5xx";
}

class DemoApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function eventsInWindow(projectId: string, windowPreset: string): EventRow[] {
  const since = windowStart(windowPreset);
  return store.events.filter((event) => event.project_id === projectId && event.received_at >= since);
}

function allAttempts(projectId: string, windowPreset: string): Array<{ event: EventRow; attempts: AttemptRow[] }> {
  return eventsInWindow(projectId, windowPreset).map((event) => ({
    event,
    attempts: store.attemptsByEvent.get(event.id) ?? []
  }));
}

function timeseries(events: EventRow[], bucket: string): Array<{ bucket_start: number; count: number }> {
  const sizeMs = bucket === "hour" ? HOUR : DAY;
  const since = events.length ? Math.min(...events.map((event) => event.received_at)) : NOW - 7 * DAY;
  const start = Math.floor((since - (NOW - 30 * DAY)) / sizeMs) * sizeMs + (NOW - 30 * DAY);
  const buckets = new Map<number, number>();
  for (let t = start; t <= NOW; t += sizeMs) buckets.set(t, 0);
  for (const event of events) {
    const key = Math.floor(event.received_at / sizeMs) * sizeMs;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucketStart, count]) => ({ bucket_start: bucketStart, count }));
}

function parseCursor(before: string | null): number | null {
  if (!before) return null;
  const [receivedAt] = before.split(":");
  const parsed = Number(receivedAt);
  return Number.isFinite(parsed) ? parsed : null;
}

async function handle(method: string, path: string, body: unknown): Promise<unknown> {
  const url = new URL(path, "https://demo.local");
  const route = `${method} ${url.pathname}`;
  const query = url.searchParams;
  const payloadBody = (body ?? {}) as Record<string, string>;

  // Auth
  if (route === "GET /api/me") {
    return { user: { id: "usr-demo", name: "Demo User", email: "demo@l92-labs.com", picture: "" } };
  }
  if (route === "POST /api/logout") {
    return { ok: true };
  }

  // Projects
  if (route === "GET /api/projects") {
    return { projects: store.projects };
  }
  if (route === "POST /api/projects") {
    const name = payloadBody.name?.trim() || "Untitled";
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || makeId("prj");
    const project: ProjectRow = { id: makeId("prj"), slug, name, retention_days: 3, plan_tier: "free" };
    store.projects.push(project);
    return { project };
  }
  const projectPatch = /^PATCH \/api\/projects\/([^/]+)$/.exec(route);
  if (projectPatch) {
    const project = store.projects.find((p) => p.id === projectPatch[1]);
    if (!project) throw new DemoApiError(404, "Project not found");
    if (payloadBody.name) project.name = payloadBody.name;
    if ("primary_forward_url" in payloadBody) project.primary_forward_url = payloadBody.primary_forward_url || null;
    return { project };
  }
  const projectDelete = /^DELETE \/api\/projects\/([^/]+)$/.exec(route);
  if (projectDelete) {
    store.projects = store.projects.filter((p) => p.id !== projectDelete[1]);
    return { ok: true };
  }

  // Endpoints
  if (method === "GET" && /^\/api\/projects\/[^/]+\/endpoints$/.test(url.pathname)) {
    const projectId = url.pathname.split("/")[3];
    return { endpoints: store.endpoints.filter((e) => e.project_id === projectId) };
  }
  if (method === "POST" && /^\/api\/projects\/[^/]+\/endpoints$/.test(url.pathname)) {
    const projectId = url.pathname.split("/")[3];
    const endpoint: ProjectEndpointRow = {
      id: makeId("ept"),
      project_id: projectId,
      name: payloadBody.name || "Endpoint",
      path: payloadBody.path || makeId("path"),
      forward_url: payloadBody.forward_url || null,
      active: 1,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    store.endpoints.push(endpoint);
    return { endpoint };
  }
  const endpointPatch = /^PATCH \/api\/projects\/([^/]+)\/endpoints\/([^/]+)$/.exec(route);
  if (endpointPatch && method === "PATCH") {
    const endpoint = store.endpoints.find((e) => e.id === endpointPatch[2]);
    if (!endpoint) throw new DemoApiError(404, "Endpoint not found");
    if (payloadBody.name) endpoint.name = payloadBody.name;
    if (payloadBody.path) endpoint.path = payloadBody.path;
    if ("forward_url" in payloadBody) endpoint.forward_url = payloadBody.forward_url || null;
    endpoint.updated_at = Date.now();
    return { endpoint };
  }
  const endpointDelete = /^DELETE \/api\/projects\/([^/]+)\/endpoints\/([^/]+)$/.exec(route);
  if (endpointDelete && method === "DELETE") {
    store.endpoints = store.endpoints.filter((e) => e.id !== endpointDelete[2]);
    return { ok: true };
  }

  // Events
  if (method === "GET" && /^\/api\/projects\/[^/]+\/events$/.test(url.pathname)) {
    const projectId = url.pathname.split("/")[3];
    const limit = Math.min(200, Math.max(1, Number(query.get("limit") ?? "100")));
    const before = parseCursor(query.get("before"));
    const projectEvents = store.events
      .filter((event) => event.project_id === projectId && (before === null || event.received_at < before))
      .sort((a, b) => b.received_at - a.received_at);
    const page = projectEvents.slice(0, limit);
    const last = page[page.length - 1];
    const pageInfo: EventPageInfo = {
      nextCursor: page.length === limit && last ? `${last.received_at}:${last.id}` : null,
      hasMore: page.length === limit && Boolean(last)
    };
    return { events: page, pageInfo };
  }
  const attemptsMatch = /^\/api\/projects\/([^/]+)\/events\/([^/]+)\/attempts$/.exec(url.pathname);
  if (method === "GET" && attemptsMatch) {
    return { attempts: store.attemptsByEvent.get(attemptsMatch[2]) ?? [] };
  }
  const payloadMatch = /^\/api\/projects\/([^/]+)\/events\/([^/]+)\/payload$/.exec(url.pathname);
  if (method === "GET" && payloadMatch) {
    const event = store.events.find((candidate) => candidate.id === payloadMatch[2]);
    if (!event) throw new DemoApiError(404, "Event not found");
    let queryParams: Record<string, string | string[]> = {};
    const seedlingQuery = event.request_method === "GET" ? { verify: "1" } : null;
    if (seedlingQuery) queryParams = seedlingQuery;
    return {
      eventId: event.id,
      payload: store.payloadsByEvent.get(event.id) ?? "{}",
      method: event.request_method ?? "POST",
      queryParams,
      endpointPath: event.endpoint_path ?? event.project_slug,
      replay: event.replay === true
    };
  }
  const tunnelsForEvent = /^\/api\/projects\/([^/]+)\/events\/([^/]+)\/tunnels$/.exec(url.pathname);
  if (method === "GET" && tunnelsForEvent) {
    return { tunnels: store.tunnelsByEvent.get(tunnelsForEvent[2]) ?? [] };
  }
  const replayMatch = /^POST (\/api\/projects\/([^/]+)\/events\/([^/]+)\/replay)$/.exec(route);
  if (replayMatch) {
    const source = store.events.find((candidate) => candidate.id === replayMatch[3]);
    if (!source) throw new DemoApiError(404, "Event not found");
    const replayEvent: EventRow = {
      id: makeId("evt"),
      project_id: source.project_id,
      project_slug: source.project_slug,
      endpoint_path: source.endpoint_path,
      replay: true,
      r2_key: source.r2_key,
      replay_of_event_id: source.id,
      request_method: source.request_method,
      received_at: Date.now()
    };
    store.events.unshift(replayEvent);
    store.payloadsByEvent.set(replayEvent.id, store.payloadsByEvent.get(source.id) ?? "{}");
    const sourceAttempts = store.attemptsByEvent.get(source.id) ?? [];
    const sourceDestination = sourceAttempts[0]?.destination_id ?? "fwd-default";
    // Replays usually land: first attempt succeeds, which is the whole point of the DLQ loop.
    store.attemptsByEvent.set(replayEvent.id, attemptsFor("replayed", replayEvent.received_at, sourceDestination));
    return { ok: true, eventId: replayEvent.id };
  }

  // API keys
  if (method === "GET" && /^\/api\/projects\/[^/]+\/api-keys$/.test(url.pathname)) {
    const projectId = url.pathname.split("/")[3];
    return { apiKeys: store.keys.filter((key) => store.keyProjects.get(key.id) === projectId) };
  }
  if (method === "POST" && /^\/api\/projects\/[^/]+\/api-keys$/.test(url.pathname)) {
    const projectId = url.pathname.split("/")[3];
    const id = `key-${projectId.slice(4)}-${store.keys.length + 1}`;
    const key: ApiKeyRow = {
      id,
      label: payloadBody.label || "Default",
      created_at: Date.now(),
      revoked_at: null,
      fingerprint: Math.random().toString(16).slice(2, 14) + Math.random().toString(16).slice(2, 10)
    };
    store.keys.push(key);
    store.keyProjects.set(id, projectId);
    const token = `pk_demo_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    store.keyTokens.set(id, token);
    return { apiKey: { id, token } };
  }
  const rotateMatch = /^POST \/api\/projects\/([^/]+)\/api-keys\/([^/]+)\/rotate$/.exec(route);
  if (rotateMatch) {
    const key = store.keys.find((k) => k.id === rotateMatch[2]);
    if (!key) throw new DemoApiError(404, "Key not found");
    key.created_at = Date.now();
    const token = `pk_demo_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    store.keyTokens.set(key.id, token);
    return { apiKey: { id: key.id, token } };
  }
  const revokeMatch = /^DELETE \/api\/projects\/([^/]+)\/api-keys\/([^/]+)$/.exec(route);
  if (revokeMatch) {
    const key = store.keys.find((k) => k.id === revokeMatch[2]);
    if (key) key.revoked_at = Date.now();
    return { ok: true };
  }

  // Tunnels
  if (method === "GET" && url.pathname === "/api/tunnels") {
    const projectSlug = query.get("projectSlug");
    return { tunnels: store.tunnels.filter((tunnel) => tunnel.projectSlug === projectSlug) };
  }
  if (route === "POST /api/tunnels/disconnect") {
    const tunnelId = payloadBody.tunnelId;
    store.tunnels = store.tunnels.filter((tunnel) => tunnel.id !== tunnelId);
    return { ok: true };
  }

  // Metrics
  if (method === "GET" && url.pathname === "/api/metrics/projects-volume") {
    const since = windowStart(query.get("window") ?? "7d");
    const metrics = store.projects.map((project) => ({
      project_id: project.id,
      project_slug: project.slug,
      project_name: project.name,
      count: store.events.filter((event) => event.project_id === project.id && event.received_at >= since).length
    }));
    return { metrics };
  }
  const projectMetric = /^GET \/api\/metrics\/project\/([^/]+)\/(.+)$/.exec(route);
  if (projectMetric) {
    const projectId = projectMetric[1];
    const metric = projectMetric[2].split("?")[0];
    const windowPreset = query.get("window") ?? "7d";
    const rows = allAttempts(projectId, windowPreset);
    const flatAttempts = rows.flatMap((row) => row.attempts);
    if (metric === "timeseries") {
      return { points: timeseries(eventsInWindow(projectId, windowPreset), query.get("bucket") ?? "day") };
    }
    if (metric === "status-codes") {
      const buckets = ["http_2xx", "http_4xx", "http_5xx", "timeout_or_network"] as const;
      const total = flatAttempts.length || 1;
      return {
        metrics: buckets.map((bucket) => {
          const count = flatAttempts.filter((attempt) => statusBucket(attempt.status_code) === bucket).length;
          return { bucket, count, percentage: Math.round((count / total) * 100) };
        })
      };
    }
    if (metric === "status-codes-detailed") {
      const counts = new Map<string, number>();
      for (const attempt of flatAttempts) {
        const code = String(attempt.status_code ?? "timeout");
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
      const total = flatAttempts.length || 1;
      return {
        metrics: [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([code, count]) => ({ code, count, percentage: Math.round((count / total) * 100) }))
      };
    }
    if (metric === "latency") {
      const durations = flatAttempts.map((attempt) => attempt.duration_ms ?? 300).sort((a, b) => a - b);
      const pick = (p: number): number => (durations.length ? durations[Math.min(durations.length - 1, Math.floor(p * durations.length))] : 0);
      return {
        latency: {
          p50: pick(0.5),
          p95: pick(0.95),
          p99: pick(0.99),
          avg: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
          max: durations.length ? durations[durations.length - 1] : 0
        }
      };
    }
    if (metric === "delivery-health") {
      const latest = rows.flatMap((row) => {
        const latestByTarget = new Map<string, AttemptRow>();
        for (const attempt of row.attempts) {
          const key = attempt.destination_id ?? "target";
          const existing = latestByTarget.get(key);
          if (!existing || attempt.attempt_no >= existing.attempt_no) latestByTarget.set(key, attempt);
        }
        return [...latestByTarget.values()];
      });
      const successCount = latest.filter((attempt) => attempt.success === 1).length;
      const failedCount = latest.length - successCount;
      return { health: { successCount, failedCount, successRate: latest.length ? Math.round((successCount / latest.length) * 100) : 100 } };
    }
    if (metric === "ops") {
      const events = eventsInWindow(projectId, windowPreset);
      const rateLimited = Math.max(1, Math.round(events.length * 0.06));
      return {
        summary: { ingressCount: events.length, rateLimitedCount: rateLimited, rateLimitedProject: Math.ceil(rateLimited / 2), rateLimitedIp: Math.floor(rateLimited / 2) },
        alerts: { delivery_failure: rows.filter((row) => row.attempts.some((attempt) => attempt.success === 0)).length },
        rateLimitedSeries: timeseries(events, windowPreset === "24h" ? "hour" : "day").map((point) => ({
          bucket_start: point.bucket_start,
          count: Math.max(0, Math.round(point.count * 0.06))
        })),
        topFailingDestinations: (() => {
          const byDestination = new Map<string, { failed: number; total: number }>();
          for (const attempt of flatAttempts) {
            const key = attempt.destination_id ?? "target";
            const entry = byDestination.get(key) ?? { failed: 0, total: 0 };
            entry.total += 1;
            if (attempt.success !== 1) entry.failed += 1;
            byDestination.set(key, entry);
          }
          return [...byDestination.entries()]
            .map(([destinationId, entry]) => ({
              destinationId,
              destinationName: destinationId.replace("fwd-", "").replace(/-\d+$/, ""),
              failedCount: entry.failed,
              totalCount: entry.total,
              failureRate: entry.total ? Math.round((entry.failed / entry.total) * 100) : 0
            }))
            .filter((entry) => entry.failedCount > 0)
            .sort((a, b) => b.failedCount - a.failedCount);
        })()
      };
    }
  }

  throw new DemoApiError(404, `Demo fixture does not implement ${route}`);
}

export async function demoRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  await sleep(80 + Math.random() * 220);
  const result = await handle(method, path, body);
  return result as T;
}
