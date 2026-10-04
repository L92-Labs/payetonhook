const DEFAULT_WORKER_API_BASE = "https://api.payetonhook.l92-labs.com";
const apiBase = import.meta.env.VITE_API_BASE ?? DEFAULT_WORKER_API_BASE;
let csrfToken: string | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// DEMO-ONLY MODE (VITE_DEMO=1)
// Serves realistic fixture data from a small in-memory store so the whole
// dashboard can render (and be screenshotted) without a backend. Strictly
// env-gated: when VITE_DEMO is unset, every request below hits the real API
// and the Google login flow is untouched.
// ─────────────────────────────────────────────────────────────────────────────

const DEMO = import.meta.env.VITE_DEMO === "1";

import type {
  ApiKeyRow,
  AttemptRow,
  EventRow,
  ProjectEndpointRow,
  ProjectRow,
  TunnelAttemptRow,
  TunnelConnection
} from "../pages/dashboard/types";

type DemoStore = {
  me: { user: { id: string; name: string; email: string; picture: string } };
  projects: ProjectRow[];
  endpoints: ProjectEndpointRow[];
  apiKeys: ApiKeyRow[];
  events: EventRow[];
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const MINUTE = 60_000;

function demoId(prefix: string, index: number): string {
  const seed = (index * 2654435761) >>> 0;
  return `${prefix}_${seed.toString(36).padStart(7, "0")}${((seed >> 8) % 1000).toString(36).padStart(3, "0")}`;
}

function buildDemoStore(): DemoStore {
  const now = Date.now();
  const projects: ProjectRow[] = [
    { id: "prj_prod", slug: "payeton-prod", name: "Payeton Prod", retention_days: 30, plan_tier: "pro", primary_forward_url: "https://app.payetonhook.l92-labs.com/hooks/primary" },
    { id: "prj_staging", slug: "staging-relay", name: "Staging Relay", retention_days: 14, plan_tier: "free", primary_forward_url: "https://staging.payetonhook.l92-labs.com/webhook" },
    { id: "prj_billing", slug: "billing-hooks", name: "Billing Hooks", retention_days: 90, plan_tier: "pro", primary_forward_url: null }
  ];

  const endpoints: ProjectEndpointRow[] = [
    { id: "ept_1", project_id: "prj_prod", name: "Stripe Alternates", path: "stripe-alt", forward_url: "https://app.payetonhook.l92-labs.com/hooks/stripe-alt", active: 1, created_at: now - 32 * DAY, updated_at: now - 4 * DAY },
    { id: "ept_2", project_id: "prj_prod", name: "GitHub Events", path: "github", forward_url: null, active: 1, created_at: now - 21 * DAY, updated_at: now - 21 * DAY },
    { id: "ept_3", project_id: "prj_staging", name: "Canary Route", path: "canary", forward_url: "http://127.0.0.1:3000/webhook", active: 0, created_at: now - 9 * DAY, updated_at: now - 2 * DAY }
  ];

  const apiKeys: ApiKeyRow[] = [
    { id: "key_1", label: "CI pipeline", created_at: now - 45 * DAY, revoked_at: null, fingerprint: "9f2c41ab77d0e3c5a1b8" },
    { id: "key_2", label: "Local dev", created_at: now - 18 * DAY, revoked_at: null, fingerprint: "4ad903be62c7f118d5e0" },
    { id: "key_3", label: "Legacy script", created_at: now - 88 * DAY, revoked_at: now - 12 * DAY, fingerprint: "c7710ee4a9b32f0658d4" }
  ];

  // ~30 events across the three projects, spread over the last week.
  const sources = ["stripe", "github", "shopify", "internal-cron"] as const;
  const methods = ["POST", "POST", "POST", "GET"] as const;
  const events: EventRow[] = [];
  let seq = 0;
  for (const project of projects) {
    const count = project.id === "prj_prod" ? 16 : project.id === "prj_staging" ? 8 : 6;
    for (let i = 0; i < count; i += 1) {
      const receivedAt = now - Math.round((i * 5.3 + (seq % 3) * 1.7) * HOUR) - seq * 11 * MINUTE;
      const source = sources[(seq + i) % sources.length];
      const method = methods[(seq + i) % methods.length];
      const customEndpoint = project.id === "prj_prod" && i % 5 === 2 ? endpoints[seq % 2].path : null;
      const isReplay = seq % 9 === 4;
      events.push({
        id: demoId("evt", seq + 7),
        project_id: project.id,
        project_slug: project.slug,
        endpoint_path: customEndpoint ?? (source === "github" ? "github" : null),
        replay: isReplay,
        r2_key: `events/${project.slug}/${receivedAt}-${seq}.json`,
        replay_of_event_id: isReplay ? demoId("evt", Math.max(0, seq - 3)) : null,
        request_method: method,
        received_at: receivedAt
      });
      seq += 1;
    }
  }
  events.sort((a, b) => b.received_at - a.received_at);

  return { me: { user: { id: "usr_demo", name: "Demo User", email: "demo@l92-labs.com", picture: "" } }, projects, endpoints, apiKeys, events };
}

const demoStore: DemoStore | null = DEMO ? buildDemoStore() : null;

function demoAttempts(eventId: string): AttemptRow[] {
  const index = demoStore!.events.findIndex((event) => event.id === eventId);
  const variant = Math.abs(index * 31 + 7) % 10;
  const base: AttemptRow[] = [
    { id: `${eventId}_a1`, attempt_no: 1, status_code: 200, success: 1, error_message: null, attempted_at: demoStore!.events[index >= 0 ? index : 0].received_at + 120 }
  ];
  if (variant === 3 || variant === 7) {
    base.unshift({
      id: `${eventId}_a0`,
      attempt_no: 0,
      status_code: variant === 7 ? null : 500,
      success: 0,
      error_message: variant === 7 ? "connect timeout after 10000ms" : "destination answered 500 Internal Server Error",
      attempted_at: demoStore!.events[index >= 0 ? index : 0].received_at + 90
    });
  }
  if (variant === 5) {
    base.push({
      id: `${eventId}_a2`,
      attempt_no: 2,
      status_code: 429,
      success: 0,
      error_message: "destination rate limited the replay",
      attempted_at: demoStore!.events[index >= 0 ? index : 0].received_at + 480
    });
  }
  return base;
}

function demoTunnelAttempts(eventId: string): TunnelAttemptRow[] {
  const index = demoStore!.events.findIndex((event) => event.id === eventId);
  const event = demoStore!.events[index >= 0 ? index : 0];
  if (Math.abs(index) % 3 !== 0 || event.project_id !== "prj_prod") return [];
  const ok = Math.abs(index) % 4 !== 1;
  return [
    {
      tunnel_id: "tnl_local_macbook",
      target_url: "http://localhost:3000/webhook",
      device_label: "macbook-pro-m3",
      source_ip: "92.184.11.4",
      country: "FR",
      os: "darwin",
      platform: "node",
      success: ok ? 1 : 0,
      status_code: ok ? 200 : null,
      error_message: ok ? null : "ECONNREFUSED 127.0.0.1:3000",
      duration_ms: ok ? 42 + (Math.abs(index) % 60) : null,
      attempted_at: event.received_at + 140
    }
  ];
}

function demoPayload(event: EventRow): { payload: string; method: string; queryParams: Record<string, string | string[]>; endpointPath: string | null; replay: boolean } {
  const slug = event.project_slug;
  const body =
    event.project_id === "prj_billing"
      ? { id: `inv_${event.id.slice(-6)}`, object: "invoice", amount_due: 4200, currency: "eur", status: "paid", customer: "cus_demo_812", received_via: slug }
      : {
          id: event.id,
          type: event.endpoint_path === "github" ? "pull_request.closed" : "payment_intent.succeeded",
          livemode: slug === "payeton-prod",
          amount: 1999,
          currency: "usd",
          source: slug,
          signature: "t=1770000000,v1=8f2c41ab77d0e3c5a1b8d94c",
          context: { region: "eu-west", attempt: event.replay ? "replay" : "live" }
        };
  const queryParams: Record<string, string | string[]> =
    (event.request_method ?? "POST") === "GET" ? { source: slug, verify: "1", trace: [event.id.slice(0, 8), "secondary"] } : {};
  return {
    payload: JSON.stringify(body, null, 2),
    method: event.request_method ?? "POST",
    queryParams,
    endpointPath: event.endpoint_path ?? null,
    replay: event.replay === true
  };
}

function demoTunnels(projectSlug: string): TunnelConnection[] {
  const now = Date.now();
  if (projectSlug !== "payeton-prod") return [];
  return [
    {
      id: "tnl_local_macbook",
      projectSlug,
      workerUrl: "wss://tunnel.payetonhook.l92-labs.com/tnl_local_macbook",
      targetUrl: "http://localhost:3000/webhook",
      deviceLabel: "macbook-pro-m3",
      hostname: "macbook-pro-m3.local",
      os: "darwin 24.1.0",
      platform: "node v22.11.0",
      nodeVersion: "v22.11.0",
      sourceIp: "92.184.11.4",
      country: "FR",
      connectedAt: now - 3 * HOUR,
      lastActivity: now - 2 * MINUTE,
      eventsForwarded: 128,
      deliveriesOk: 124,
      deliveriesFailed: 4,
      success24h: 421,
      failed24h: 9,
      lastError: null,
      status: "live"
    },
    {
      id: "tnl_ci_runner",
      projectSlug,
      workerUrl: "wss://tunnel.payetonhook.l92-labs.com/tnl_ci_runner",
      targetUrl: "http://host.docker.internal:8080/hooks",
      deviceLabel: "github-runner-7",
      hostname: "runner-7.ci.internal",
      os: "linux 6.8.0",
      platform: "node v20.17.0",
      nodeVersion: "v20.17.0",
      sourceIp: "140.82.115.3",
      country: "NL",
      connectedAt: now - 26 * HOUR,
      lastActivity: now - 4 * HOUR,
      eventsForwarded: 57,
      deliveriesOk: 57,
      deliveriesFailed: 0,
      success24h: 57,
      failed24h: 0,
      lastError: null,
      status: "idle"
    }
  ];
}

function demoTimeseries(window: string, seed: number): Array<{ bucket_start: number; count: number }> {
  const points = window === "24h" ? 24 : window === "7d" ? 7 : 30;
  const step = window === "24h" ? HOUR : DAY;
  const now = Date.now();
  return Array.from({ length: points }, (_, index) => {
    const wave = Math.sin((index + seed) * 0.7) * 14 + Math.cos((index + seed) * 0.31) * 9;
    return { bucket_start: now - (points - index) * step, count: Math.max(2, Math.round(38 + wave + ((index * seed) % 11))) };
  });
}

async function demoRequest<T>(rawPath: string, method: string, body?: unknown): Promise<T> {
  const store = demoStore!;
  await new Promise((resolve) => setTimeout(resolve, 140));
  const [path, query = ""] = rawPath.split("?");
  const params = new URLSearchParams(query);
  const window = params.get("window") ?? "7d";
  const projectId = path.match(/^\/api\/projects\/([^/]+)/)?.[1] ?? null;
  const eventId = path.match(/^\/api\/projects\/[^/]+\/events\/([^/]+)/)?.[1] ?? null;

  const json = <R,>(value: R): R => JSON.parse(JSON.stringify(value)) as R;

  // Session
  if (path === "/api/me") return json(store.me) as T;
  if (path === "/api/logout") return {} as T;

  // Projects
  if (path === "/api/projects" && method === "GET") return json({ projects: store.projects }) as T;
  if (path === "/api/projects" && method === "POST") {
    const name = (body as { name?: string } | undefined)?.name ?? "Untitled";
    const project: ProjectRow = { id: `prj_${Date.now().toString(36)}`, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24) || "project", name, retention_days: 30, plan_tier: "free", primary_forward_url: null };
    store.projects = [...store.projects, project];
    return json({ project }) as T;
  }
  if (projectId && path === `/api/projects/${projectId}` && method === "PATCH") {
    store.projects = store.projects.map((project) =>
      project.id === projectId
        ? { ...project, name: (body as { name?: string }).name ?? project.name, primary_forward_url: (body as { primary_forward_url?: string | null }).primary_forward_url ?? project.primary_forward_url }
        : project
    );
    return {} as T;
  }
  if (projectId && path === `/api/projects/${projectId}` && method === "DELETE") {
    store.projects = store.projects.filter((project) => project.id !== projectId);
    return {} as T;
  }

  // Events
  if (projectId && path === `/api/projects/${projectId}/events` && method === "GET") {
    const events = store.events.filter((event) => event.project_id === projectId);
    return json({ events, pageInfo: { nextCursor: null, hasMore: false } }) as T;
  }
  if (eventId && path === `/api/projects/${projectId}/events/${eventId}/attempts`) {
    return json({ attempts: demoAttempts(eventId) }) as T;
  }
  if (eventId && path === `/api/projects/${projectId}/events/${eventId}/payload`) {
    const event = store.events.find((candidate) => candidate.id === eventId);
    return json(demoPayload(event ?? store.events[0])) as T;
  }
  if (eventId && path === `/api/projects/${projectId}/events/${eventId}/tunnels`) {
    return json({ tunnels: demoTunnelAttempts(eventId) }) as T;
  }
  if (eventId && path === `/api/projects/${projectId}/events/${eventId}/replay` && method === "POST") {
    const original = store.events.find((candidate) => candidate.id === eventId);
    if (original) {
      const replay: EventRow = { ...original, id: demoId("evt", store.events.length + 3), replay: true, replay_of_event_id: original.id, received_at: Date.now() };
      store.events = [replay, ...store.events];
    }
    return {} as T;
  }

  // Endpoints
  if (projectId && path === `/api/projects/${projectId}/endpoints` && method === "GET") {
    return json({ endpoints: store.endpoints.filter((endpoint) => endpoint.project_id === projectId) }) as T;
  }
  if (projectId && path === `/api/projects/${projectId}/endpoints` && method === "POST") {
    const request = body as { name?: string; path?: string; forward_url?: string | null };
    const endpoint: ProjectEndpointRow = {
      id: `ept_${Date.now().toString(36)}`,
      project_id: projectId,
      name: request.name ?? "Endpoint",
      path: request.path ?? "route",
      forward_url: request.forward_url ?? null,
      active: 1,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    store.endpoints = [...store.endpoints, endpoint];
    return json({ endpoint }) as T;
  }
  const endpointId = path.match(/^\/api\/projects\/[^/]+\/endpoints\/([^/]+)/)?.[1] ?? null;
  if (endpointId && method === "PATCH") {
    store.endpoints = store.endpoints.map((endpoint) => (endpoint.id === endpointId ? { ...endpoint, ...(body as Partial<ProjectEndpointRow>), updated_at: Date.now() } : endpoint));
    return {} as T;
  }
  if (endpointId && method === "DELETE") {
    store.endpoints = store.endpoints.filter((endpoint) => endpoint.id !== endpointId);
    return {} as T;
  }

  // API keys
  if (projectId && path === `/api/projects/${projectId}/api-keys` && method === "GET") {
    return json({ apiKeys: store.apiKeys }) as T;
  }
  if (projectId && path === `/api/projects/${projectId}/api-keys` && method === "POST") {
    const label = (body as { label?: string } | undefined)?.label ?? "Default";
    const key: ApiKeyRow = { id: `key_${Date.now().toString(36)}`, label, created_at: Date.now(), revoked_at: null, fingerprint: Math.random().toString(16).slice(2, 22) };
    store.apiKeys = [key, ...store.apiKeys];
    return json({ apiKey: { id: key.id, token: `pkh_demo_${key.fingerprint}${Math.random().toString(36).slice(2, 10)}` } }) as T;
  }
  const keyId = path.match(/^\/api\/projects\/[^/]+\/api-keys\/([^/]+)/)?.[1] ?? null;
  if (keyId && path.endsWith("/rotate") && method === "POST") {
    return json({ apiKey: { id: keyId, token: `pkh_demo_rotated_${Math.random().toString(36).slice(2, 12)}` } }) as T;
  }
  if (keyId && method === "DELETE") {
    store.apiKeys = store.apiKeys.map((key) => (key.id === keyId ? { ...key, revoked_at: Date.now() } : key));
    return {} as T;
  }

  // Metrics
  if (path === "/api/metrics/projects-volume") {
    const metrics = store.projects.map((project, index) => ({
      project_id: project.id,
      project_slug: project.slug,
      project_name: project.name,
      count: [1284, 431, 357][index] ?? 90
    }));
    return json({ metrics }) as T;
  }
  if (projectId && path === `/api/metrics/project/${projectId}/timeseries`) {
    return json({ points: demoTimeseries(params.get("bucket") === "hour" ? "24h" : window, projectId.length) }) as T;
  }
  if (projectId && path === `/api/metrics/project/${projectId}/status-codes`) {
    return json({
      metrics: [
        { bucket: "http_2xx", count: 1841, percentage: 91.4 },
        { bucket: "http_4xx", count: 98, percentage: 4.9 },
        { bucket: "http_5xx", count: 47, percentage: 2.3 },
        { bucket: "timeout_or_network", count: 28, percentage: 1.4 }
      ] as Array<{ bucket: "http_2xx" | "http_4xx" | "http_5xx" | "timeout_or_network"; count: number; percentage: number }>
    }) as T;
  }
  if (projectId && path === `/api/metrics/project/${projectId}/status-codes-detailed`) {
    return json({
      metrics: [
        { code: "200", count: 1798, percentage: 89.2 },
        { code: "202", count: 43, percentage: 2.1 },
        { code: "429", count: 61, percentage: 3.0 },
        { code: "400", count: 24, percentage: 1.2 },
        { code: "500", count: 31, percentage: 1.5 },
        { code: "503", count: 16, percentage: 0.8 },
        { code: "timeout", count: 28, percentage: 1.4 }
      ]
    }) as T;
  }
  if (projectId && path === `/api/metrics/project/${projectId}/latency`) {
    return json({ latency: { p50: 84, p95: 312, p99: 741, avg: 129, max: 2140 } }) as T;
  }
  if (projectId && path === `/api/metrics/project/${projectId}/delivery-health`) {
    return json({ health: { successCount: 1841, failedCount: 173, successRate: 91 } }) as T;
  }
  if (projectId && path === `/api/metrics/project/${projectId}/ops`) {
    return json({
      summary: { ingressCount: 2073, rateLimitedCount: 96, rateLimitedProject: 41, rateLimitedIp: 55 },
      alerts: { "429 burst from single IP": 12, "5xx spike on stripe-alt": 5, "tunnel reconnect storm": 2 },
      rateLimitedSeries: demoTimeseries(window, 5),
      topFailingDestinations: [
        { destinationId: "ept_1", destinationName: "Stripe Alternates", failedCount: 47, totalCount: 412, failureRate: 11.4 },
        { destinationId: "primary", destinationName: "Primary forwarder", failedCount: 21, totalCount: 1601, failureRate: 1.3 }
      ]
    }) as T;
  }

  // Tunnels
  if (path === "/api/tunnels") {
    return json({ tunnels: demoTunnels(params.get("projectSlug") ?? "") }) as T;
  }
  if (path === "/api/tunnels/disconnect" && method === "POST") return {} as T;

  throw new Error(`DEMO-ONLY router: unhandled ${method} ${path}`);
}
// ────────────────────────── end DEMO-ONLY section ──────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // DEMO-ONLY branch: never touches the network when VITE_DEMO=1.
  if (DEMO) {
    return demoRequest<T>(path, options?.method ?? "GET", options?.body ? JSON.parse(String(options.body)) : undefined);
  }
  const response = await fetch(`${apiBase}${path}`, {
    credentials: "include",
    ...options
  });
  const nextCsrf = response.headers.get("x-csrf-token");
  if (nextCsrf) {
    csrfToken = nextCsrf;
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `API error ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getApiBase(): string {
  return apiBase;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

function csrfHeaders(): HeadersInit {
  const token = getCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...csrfHeaders()
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...csrfHeaders()
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, {
    method: "DELETE",
    headers: csrfHeaders()
  });
}
