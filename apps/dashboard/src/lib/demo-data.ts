// DEMO-ONLY: fixture backend for the Impeccable design proposition preview.
// Strictly gated behind VITE_DEMO=1 in ./api.ts — never used in real builds.
// All data below is synthetic and authored for capture; it must never be
// presented as production evidence.

import type {
  ApiKeyRow,
  AttemptRow,
  DeliveryHealthMetric,
  DetailedStatusMetric,
  EventRow,
  LatencyMetric,
  OpsDestinationFailure,
  OpsSummary,
  ProjectEndpointRow,
  ProjectRow,
  ProjectsVolumeMetric,
  StatusBucketMetric,
  TimeseriesPoint,
  TunnelAttemptRow,
  TunnelConnection
} from "../pages/dashboard/types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const now = Date.now();

function hex(len: number, seed: number): string {
  let out = "";
  let state = seed >>> 0 || 1;
  while (out.length < len) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out += state.toString(16).padStart(8, "0");
  }
  return out.slice(0, len);
}

function id(prefix: string, seed: number): string {
  return `${prefix}_${hex(16, seed)}`;
}

// ─── Projects ────────────────────────────────────────────────────────────────

let projects: ProjectRow[] = [
  {
    id: "prj_checkout",
    slug: "checkout-prod",
    name: "Checkout Production",
    retention_days: 30,
    plan_tier: "pro",
    primary_forward_url: "https://ops.internal/hooks/checkout"
  },
  {
    id: "prj_ghintel",
    slug: "gh-intel",
    name: "GitHub Integrations",
    retention_days: 14,
    plan_tier: "free",
    primary_forward_url: null
  },
  {
    id: "prj_stripesbx",
    slug: "stripe-sbx",
    name: "Stripe Sandbox",
    retention_days: 7,
    plan_tier: "free",
    primary_forward_url: "https://sandbox.acme.dev/stripe"
  }
];

// ─── Payloads ────────────────────────────────────────────────────────────────

type PayloadKind = "stripe" | "github" | "order" | "health" | "verify" | "dlq";

function payloadFor(kind: PayloadKind, seed: string): string {
  switch (kind) {
    case "stripe":
      return JSON.stringify(
        {
          id: `evt_stripe_${seed.slice(0, 10)}`,
          object: "event",
          api_version: "2024-06-20",
          created: Math.floor(now / 1000) - 42,
          type: "payment_intent.succeeded",
          data: {
            object: {
              id: `pi_${seed.slice(2, 12)}`,
              object: "payment_intent",
              amount: 12900,
              currency: "eur",
              status: "succeeded",
              customer: "cus_9fj2kdl",
              payment_method: "pm_card_visa",
              metadata: { order_ref: `ORD-${seed.slice(4, 9).toUpperCase()}`, source: "checkout-prod" }
            }
          }
        },
        null,
        2
      );
    case "github":
      return JSON.stringify(
        {
          ref: "refs/heads/main",
          before: `7c1d${seed.slice(0, 4)}0a`,
          after: `3b9f${seed.slice(4, 8)}e2`,
          repository: { id: 9012, name: "acme-api", full_name: "acme/acme-api", private: false },
          pusher: { name: "loiu92", email: "loiu92@example.com" },
          commits: [
            { id: `44d1${seed.slice(0, 6)}`, message: "fix(webhooks): honor idempotency keys on retry" },
            { id: `a02c${seed.slice(6, 12)}`, message: "chore: bump receiver timeout to 10s" }
          ]
        },
        null,
        2
      );
    case "order":
      return JSON.stringify(
        {
          order_id: `ORD-${seed.slice(0, 6).toUpperCase()}`,
          status: "paid",
          total: { amount: 8450, currency: "eur" },
          items: [
            { sku: "TEE-001", qty: 2, unit: 3200 },
            { sku: "STK-004", qty: 1, unit: 2050 }
          ],
          customer: { email: "dana@example.com", locale: "fr-FR" },
          received_from_ip: "203.0.113.24"
        },
        null,
        2
      );
    case "health":
      return JSON.stringify({ ok: true, uptime_s: 918402, checks: { db: "up", queue: "up", cache: "degraded" } }, null, 2);
    case "verify":
      return "";
    case "dlq":
      return JSON.stringify(
        {
          order_id: `ORD-${seed.slice(0, 6).toUpperCase()}`,
          status: "charged",
          total: { amount: 4500, currency: "eur" },
          note: "receiver must acknowledge within 10s — see incident INC-331"
        },
        null,
        2
      );
  }
}

// ─── Events ──────────────────────────────────────────────────────────────────

type EventSpec = {
  project: string;
  minutesAgo: number;
  kind: PayloadKind;
  method?: string;
  endpointPath?: string;
  replay?: boolean;
  outcome: "ok" | "ok-retried" | "dead-5xx" | "dead-timeout" | "dead-429" | "ok-get";
};

const SPECS: EventSpec[] = [
  { project: "checkout-prod", minutesAgo: 1, kind: "order", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 3, kind: "stripe", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 7, kind: "order", endpointPath: "checkout-payments", outcome: "ok-retried" },
  { project: "checkout-prod", minutesAgo: 12, kind: "dlq", outcome: "dead-5xx" },
  { project: "checkout-prod", minutesAgo: 18, kind: "health", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 26, kind: "stripe", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 34, kind: "order", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 41, kind: "verify", method: "GET", outcome: "ok-get" },
  { project: "checkout-prod", minutesAgo: 55, kind: "dlq", outcome: "dead-timeout" },
  { project: "checkout-prod", minutesAgo: 71, kind: "stripe", endpointPath: "checkout-payments", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 88, kind: "order", outcome: "ok-retried" },
  { project: "checkout-prod", minutesAgo: 103, kind: "health", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 126, kind: "order", replay: true, outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 149, kind: "dlq", outcome: "dead-429" },
  { project: "checkout-prod", minutesAgo: 172, kind: "stripe", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 210, kind: "order", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 265, kind: "verify", method: "GET", endpointPath: "checkout-payments", outcome: "ok-get" },
  { project: "checkout-prod", minutesAgo: 340, kind: "health", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 420, kind: "stripe", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 510, kind: "order", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 640, kind: "dlq", outcome: "dead-5xx" },
  { project: "checkout-prod", minutesAgo: 780, kind: "health", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 950, kind: "order", replay: true, outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 1180, kind: "stripe", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 1440, kind: "health", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 1760, kind: "order", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 2210, kind: "stripe", endpointPath: "checkout-payments", outcome: "ok-retried" },
  { project: "checkout-prod", minutesAgo: 2680, kind: "dlq", outcome: "dead-5xx" },
  { project: "checkout-prod", minutesAgo: 3350, kind: "health", outcome: "ok" },
  { project: "checkout-prod", minutesAgo: 4100, kind: "order", outcome: "ok" },

  { project: "gh-intel", minutesAgo: 4, kind: "github", outcome: "ok" },
  { project: "gh-intel", minutesAgo: 22, kind: "github", endpointPath: "gh-ci", outcome: "ok-retried" },
  { project: "gh-intel", minutesAgo: 65, kind: "github", outcome: "ok" },
  { project: "gh-intel", minutesAgo: 130, kind: "github", outcome: "dead-5xx" },
  { project: "gh-intel", minutesAgo: 240, kind: "github", endpointPath: "gh-ci", outcome: "ok" },
  { project: "gh-intel", minutesAgo: 470, kind: "github", replay: true, outcome: "ok" },
  { project: "gh-intel", minutesAgo: 810, kind: "github", outcome: "ok" },
  { project: "gh-intel", minutesAgo: 1340, kind: "github", outcome: "ok" },

  { project: "stripe-sbx", minutesAgo: 9, kind: "stripe", outcome: "ok" },
  { project: "stripe-sbx", minutesAgo: 47, kind: "stripe", outcome: "ok" },
  { project: "stripe-sbx", minutesAgo: 96, kind: "verify", method: "GET", outcome: "ok-get" },
  { project: "stripe-sbx", minutesAgo: 175, kind: "stripe", outcome: "dead-timeout" },
  { project: "stripe-sbx", minutesAgo: 330, kind: "stripe", outcome: "ok-retried" },
  { project: "stripe-sbx", minutesAgo: 590, kind: "stripe", replay: true, outcome: "ok" },
  { project: "stripe-sbx", minutesAgo: 940, kind: "stripe", outcome: "ok" },
  { project: "stripe-sbx", minutesAgo: 1500, kind: "stripe", outcome: "ok" },
  { project: "stripe-sbx", minutesAgo: 2280, kind: "stripe", outcome: "dead-429" }
];

type DemoEvent = EventRow & {
  kind: PayloadKind;
  attempts: AttemptRow[];
  tunnels: TunnelAttemptRow[];
  queryParams: Record<string, string | string[]>;
};

function attempt(no: number, code: number | null, success: number, error: string | null, at: number): AttemptRow {
  return { id: `att_${hex(12, no * 77 + Math.trunc(at / 1000))}`, attempt_no: no, status_code: code, success, error_message: error, attempted_at: at };
}

let events: DemoEvent[] = SPECS.map((spec, index) => {
  const project = projects.find((p) => p.slug === spec.project)!;
  const seed = 0x5eed + index * 7919;
  const eventId = id("evt", seed);
  const receivedAt = now - spec.minutesAgo * MINUTE;
  const base: EventRow = {
    id: eventId,
    project_id: project.id,
    project_slug: project.slug,
    endpoint_path: spec.endpointPath ?? null,
    replay: spec.replay === true,
    r2_key: `${project.slug}/${eventId}.json`,
    replay_of_event_id: spec.replay === true ? id("evt", seed - 31) : null,
    request_method: spec.method ?? "POST",
    received_at: receivedAt
  };

  let attempts: AttemptRow[] = [];
  if (spec.outcome === "ok" || spec.outcome === "ok-get") {
    attempts = [attempt(1, 200, 1, null, receivedAt + 3_400)];
  } else if (spec.outcome === "ok-retried") {
    attempts = [
      attempt(1, 502, 0, "upstream returned 502 Bad Gateway", receivedAt + 2_100),
      attempt(2, 200, 1, null, receivedAt + 47_000)
    ];
  } else if (spec.outcome === "dead-5xx") {
    attempts = [
      attempt(1, 500, 0, "destination returned 500 Internal Server Error", receivedAt + 5_200),
      attempt(2, 500, 0, "destination returned 500 Internal Server Error", receivedAt + 160_000),
      attempt(3, 500, 0, "destination returned 500 Internal Server Error", receivedAt + 620_000)
    ];
  } else if (spec.outcome === "dead-timeout") {
    attempts = [
      attempt(1, null, 0, "connect timeout after 10000ms", receivedAt + 10_400),
      attempt(2, null, 0, "connect timeout after 10000ms", receivedAt + 172_000),
      attempt(3, null, 0, "connect timeout after 10000ms", receivedAt + 641_000)
    ];
  } else if (spec.outcome === "dead-429") {
    attempts = [
      attempt(1, 429, 0, "rate limited by destination (retry-after 60)", receivedAt + 900),
      attempt(2, 429, 0, "rate limited by destination (retry-after 300)", receivedAt + 121_000),
      attempt(3, 429, 0, "rate limited by destination (retry-after 900)", receivedAt + 480_000)
    ];
  }

  const tunnels: TunnelAttemptRow[] = [];
  const hasTunnel = spec.project !== "stripe-sbx" && index % 3 !== 1;
  if (hasTunnel) {
    tunnels.push({
      tunnel_id: id("tun", seed + 5),
      target_url: "http://localhost:3000/webhook",
      device_label: spec.project === "gh-intel" ? "ci-runner" : "dev-laptop",
      source_ip: `198.51.100.${7 + (index % 40)}`,
      country: index % 3 === 0 ? "FR" : index % 3 === 1 ? "DE" : "US",
      os: spec.project === "gh-intel" ? "linux" : "darwin",
      platform: spec.project === "gh-intel" ? "github-actions" : "arm64",
      success: spec.outcome === "dead-5xx" || spec.outcome === "dead-timeout" || spec.outcome === "dead-429" ? 0 : 1,
      status_code: spec.outcome.startsWith("dead") ? 500 : 200,
      error_message: spec.outcome.startsWith("dead") ? "local receiver crashed (exit 1)" : null,
      duration_ms: 40 + (seed % 300),
      attempted_at: receivedAt + 6_000
    });
  }

  const queryParams: Record<string, string | string[]> =
    spec.outcome === "ok-get" ? { challenge: hex(12, seed + 9), source: "uptime-probe", env: ["prod", "eu-west"] } : {};

  return { ...base, kind: spec.kind, attempts, tunnels, queryParams };
}).sort((a, b) => b.received_at - a.received_at);

function eventFor(projectId: string, eventId: string): DemoEvent | undefined {
  return events.find((e) => e.project_id === projectId && e.id === eventId);
}

// ─── Endpoints / keys / tunnels ───────────────────────────────────────────────

let endpoints: ProjectEndpointRow[] = [
  { id: "epl_payments", project_id: "prj_checkout", name: "Payments alt", path: "checkout-payments", forward_url: "https://ops.internal/hooks/payments", active: 1, created_at: now - 26 * 24 * HOUR, updated_at: now - 2 * 24 * HOUR },
  { id: "epl_sbx", project_id: "prj_checkout", name: "Sandbox mirror", path: "checkout-sbx", forward_url: null, active: 1, created_at: now - 9 * 24 * HOUR, updated_at: now - 9 * 24 * HOUR },
  { id: "epl_ci", project_id: "prj_ghintel", name: "CI hook", path: "gh-ci", forward_url: "https://ci.example.com/hooks/gh", active: 1, created_at: now - 40 * 24 * HOUR, updated_at: now - 12 * 24 * HOUR }
];

let apiKeys: ApiKeyRow[] = [
  { id: "key_ci", label: "CI deploys", created_at: now - 61 * 24 * HOUR, revoked_at: null, fingerprint: hex(24, 0xc1) },
  { id: "key_laptop", label: "laptop", created_at: now - 14 * 24 * HOUR, revoked_at: null, fingerprint: hex(24, 0x1a) },
  { id: "key_oldci", label: "old-ci", created_at: now - 120 * 24 * HOUR, revoked_at: now - 30 * 24 * HOUR, fingerprint: hex(24, 0x01d) },
  { id: "key_gh", label: "Default", created_at: now - 21 * 24 * HOUR, revoked_at: null, fingerprint: hex(24, 0x9f) },
  { id: "key_sbx", label: "sandbox tests", created_at: now - 5 * 24 * HOUR, revoked_at: null, fingerprint: hex(24, 0x55) }
];

const keyProject: Record<string, string> = {
  key_ci: "prj_checkout",
  key_laptop: "prj_checkout",
  key_oldci: "prj_checkout",
  key_gh: "prj_ghintel",
  key_sbx: "prj_stripesbx"
};

let tunnelConnections: TunnelConnection[] = [
  {
    id: "tun_live1",
    projectSlug: "checkout-prod",
    workerUrl: "wss://api.payetonhook.l92-labs.com/tunnel/checkout-prod",
    targetUrl: "http://localhost:3000/webhook",
    deviceLabel: "dev-laptop",
    hostname: "air.local",
    os: "darwin",
    platform: "arm64",
    nodeVersion: "v24.3.1",
    sourceIp: "198.51.100.7",
    country: "FR",
    connectedAt: now - 3 * HOUR,
    lastActivity: now - 2 * MINUTE,
    eventsForwarded: 148,
    deliveriesOk: 141,
    deliveriesFailed: 7,
    success24h: 96,
    failed24h: 4,
    lastError: "connect ECONNREFUSED 127.0.0.1:3000 (receiver restarting)",
    status: "live"
  },
  {
    id: "tun_idle1",
    projectSlug: "checkout-prod",
    workerUrl: "wss://api.payetonhook.l92-labs.com/tunnel/checkout-prod",
    targetUrl: "http://localhost:5173/hook",
    deviceLabel: "review-box",
    hostname: null,
    os: "linux",
    platform: "x64",
    nodeVersion: "v22.11.0",
    sourceIp: "203.0.113.40",
    country: "DE",
    connectedAt: now - 26 * HOUR,
    lastActivity: now - 4 * HOUR,
    eventsForwarded: 12,
    deliveriesOk: 12,
    deliveriesFailed: 0,
    success24h: 3,
    failed24h: 0,
    lastError: null,
    status: "idle"
  },
  {
    id: "tun_ci",
    projectSlug: "gh-intel",
    workerUrl: "wss://api.payetonhook.l92-labs.com/tunnel/gh-intel",
    targetUrl: "http://localhost:8080/gh",
    deviceLabel: "ci-runner",
    hostname: "runner-2",
    os: "linux",
    platform: "github-actions",
    nodeVersion: "v24.1.0",
    sourceIp: "192.0.2.88",
    country: "US",
    connectedAt: now - 40 * MINUTE,
    lastActivity: now - 6 * MINUTE,
    eventsForwarded: 892,
    deliveriesOk: 871,
    deliveriesFailed: 21,
    success24h: 212,
    failed24h: 6,
    lastError: null,
    status: "live"
  }
];

// ─── Metrics ─────────────────────────────────────────────────────────────────

function seededSeries(count: number, seed: number): TimeseriesPoint[] {
  const step = count <= 24 ? HOUR : 24 * HOUR;
  const start = Math.floor(now / step) * step - (count - 1) * step;
  let state = seed >>> 0 || 3;
  return Array.from({ length: count }, (_, i) => {
    state = (state * 1103515245 + 12345) >>> 0;
    const wave = 9 + (state % 14) + Math.round(6 * Math.sin(i / 3.1));
    return { bucket_start: start + i * step, count: Math.max(0, wave) };
  });
}

function metricsFor(projectId: string) {
  const projectEvents = events.filter((e) => e.project_id === projectId);
  const allAttempts = projectEvents.flatMap((e) => e.attempts);
  const okCount = allAttempts.filter((a) => a.success === 1).length;
  const failCount = allAttempts.filter((a) => a.success === 0).length;
  const byCode = new Map<string, number>();
  for (const a of allAttempts) {
    const code = a.status_code === null ? "timeout" : String(a.status_code);
    byCode.set(code, (byCode.get(code) ?? 0) + 1);
  }
  const total = Math.max(1, allAttempts.length);
  const bucketCount = (b: StatusBucketMetric["bucket"]): number =>
    [...byCode.entries()]
      .filter(([code]) =>
        b === "http_2xx" ? code.startsWith("2") : b === "http_4xx" ? code.startsWith("4") : b === "http_5xx" ? code.startsWith("5") : code === "timeout"
      )
      .reduce((sum, [, c]) => sum + c, 0);
  return {
    points: seededSeries(7, projectId.length * 131 + total),
    latency: { p50: 84, p95: 412, p99: 1180, avg: 162, max: 3210 } as LatencyMetric,
    health: { successCount: okCount, failedCount: failCount, successRate: Math.round((okCount / total) * 100) } as DeliveryHealthMetric,
    statusBuckets: (["http_2xx", "http_4xx", "http_5xx", "timeout_or_network"] as const).map((b) => ({
      bucket: b,
      count: bucketCount(b),
      percentage: Math.round((bucketCount(b) / total) * 100)
    })) as StatusBucketMetric[],
    statusDetails: [...byCode.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, count, percentage: Math.round((count / total) * 100) })) as DetailedStatusMetric[],
    opsSummary: { ingressCount: projectEvents.length + 180, rateLimitedCount: 14, rateLimitedProject: 6, rateLimitedIp: 8 } as OpsSummary,
    opsAlerts: { "5xx spike (checkout)": 3, "p99 > 1s": 5, "429 from destination": 2 } as Record<string, number>,
    opsTopFailures: [
      { destinationId: "dst_ops", destinationName: "ops.internal/hooks/checkout", failedCount: failCount, totalCount: allAttempts.length, failureRate: Math.round((failCount / total) * 100) },
      { destinationId: "dst_tunnel", destinationName: "tunnel dev-laptop", failedCount: 7, totalCount: 148, failureRate: 5 }
    ] as OpsDestinationFailure[]
  };
}

function projectsVolume(window: string): ProjectsVolumeMetric[] {
  const scale = window === "24h" ? 0.14 : window === "30d" ? 4.2 : 1;
  return projects.map((p) => ({
    project_id: p.id,
    project_slug: p.slug,
    project_name: p.name,
    count: Math.max(1, Math.round(events.filter((e) => e.project_id === p.id).length * scale + 12))
  }));
}

// ─── Router ──────────────────────────────────────────────────────────────────

const LATENCY_MS = 180;

function route<T>(method: string, rawPath: string, body: unknown): T {
  const url = new URL(rawPath, "https://demo.local");
  const path = url.pathname;
  const q = url.searchParams;
  const m = (pattern: RegExp): RegExpMatchArray | null => path.match(pattern);

  if (path === "/api/me") {
    return { user: { id: "usr_demo", name: "Dana Vega", email: "dana@example.com", picture: "" } } as T;
  }
  if (path === "/api/logout") return {} as T;

  if (path === "/api/projects") {
    if (method === "POST") {
      const name = String((body as { name?: string })?.name ?? "New Project");
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
      const project: ProjectRow = { id: `prj_${hex(6, Date.now())}`, slug, name, retention_days: 14, plan_tier: "free", primary_forward_url: null };
      projects = [...projects, project];
      return { project } as T;
    }
    return { projects } as T;
  }

  let match = m(/^\/api\/projects\/([^/]+)$/);
  if (match) {
    const pid = match[1]!;
    if (method === "PATCH") {
      const { name, primary_forward_url } = body as { name?: string; primary_forward_url?: string | null };
      projects = projects.map((p) => (p.id === pid ? { ...p, name: name ?? p.name, primary_forward_url: primary_forward_url ?? null } : p));
      return {} as T;
    }
    if (method === "DELETE") {
      projects = projects.filter((p) => p.id !== pid);
      events = events.filter((e) => e.project_id !== pid);
      return {} as T;
    }
  }

  match = m(/^\/api\/projects\/([^/]+)\/events$/);
  if (match && method === "GET") {
    const pid = match[1]!;
    const before = Number(q.get("before")) || Infinity;
    const limit = Number(q.get("limit")) || 100;
    const scoped = events.filter((e) => e.project_id === pid).sort((a, b) => b.received_at - a.received_at);
    const page = scoped.filter((e) => e.received_at < before).slice(0, limit);
    const last = page[page.length - 1];
    const hasMore = last ? scoped.some((e) => e.received_at < last.received_at) : false;
    return { events: page, pageInfo: { nextCursor: hasMore && last ? String(last.received_at) : null, hasMore } } as T;
  }

  match = m(/^\/api\/projects\/([^/]+)\/events\/([^/]+)\/attempts$/);
  if (match) {
    const ev = eventFor(match[1]!, match[2]!);
    return { attempts: ev?.attempts ?? [] } as T;
  }
  match = m(/^\/api\/projects\/([^/]+)\/events\/([^/]+)\/payload$/);
  if (match) {
    const ev = eventFor(match[1]!, match[2]!);
    if (!ev) return { payload: "" } as T;
    return {
      payload: payloadFor(ev.kind, ev.id.slice(4)),
      method: ev.request_method ?? "POST",
      queryParams: ev.queryParams,
      endpointPath: ev.endpoint_path,
      replay: ev.replay
    } as T;
  }
  match = m(/^\/api\/projects\/([^/]+)\/events\/([^/]+)\/tunnels$/);
  if (match) {
    const ev = eventFor(match[1]!, match[2]!);
    return { tunnels: ev?.tunnels ?? [] } as T;
  }
  match = m(/^\/api\/projects\/([^/]+)\/events\/([^/]+)\/replay$/);
  if (match && method === "POST") {
    const original = eventFor(match[1]!, match[2]!);
    if (original) {
      const replayed: DemoEvent = {
        ...original,
        id: id("evt", (0x5eed ^ Date.now()) & 0xffffff),
        replay: true,
        replay_of_event_id: original.id,
        received_at: Date.now(),
        attempts: [attempt(1, 200, 1, null, Date.now() + 2_500)],
        tunnels: []
      };
      events = [replayed, ...events];
    }
    return {} as T;
  }

  match = m(/^\/api\/projects\/([^/]+)\/endpoints$/);
  if (match) {
    const pid = match[1]!;
    if (method === "POST") {
      const b = body as { name?: string; path?: string; forward_url?: string | null };
      const row: ProjectEndpointRow = { id: `epl_${hex(5, Date.now())}`, project_id: pid, name: b.name ?? "endpoint", path: b.path ?? "path", forward_url: b.forward_url || null, active: 1, created_at: Date.now(), updated_at: Date.now() };
      endpoints = [...endpoints, row];
      return {} as T;
    }
    return { endpoints: endpoints.filter((e) => e.project_id === pid) } as T;
  }
  match = m(/^\/api\/projects\/([^/]+)\/endpoints\/([^/]+)$/);
  if (match) {
    const epid = match[2]!;
    if (method === "PATCH") {
      const b = body as { name?: string; path?: string; forward_url?: string | null };
      endpoints = endpoints.map((e) => (e.id === epid ? { ...e, name: b.name ?? e.name, path: b.path ?? e.path, forward_url: b.forward_url || null, updated_at: Date.now() } : e));
      return {} as T;
    }
    if (method === "DELETE") {
      endpoints = endpoints.filter((e) => e.id !== epid);
      return {} as T;
    }
  }

  match = m(/^\/api\/projects\/([^/]+)\/api-keys$/);
  if (match) {
    const pid = match[1]!;
    if (method === "POST") {
      const label = String((body as { label?: string })?.label ?? "Default");
      const kid = `key_${hex(4, Date.now())}`;
      const token = `pk_demo_${hex(32, Date.now() ^ 0x7f)}`;
      apiKeys = [...apiKeys, { id: kid, label, created_at: Date.now(), revoked_at: null, fingerprint: hex(24, Date.now() & 0xffff) }];
      keyProject[kid] = pid;
      return { apiKey: { id: kid, token } } as T;
    }
    return { apiKeys: apiKeys.filter((k) => keyProject[k.id] === pid) } as T;
  }
  match = m(/^\/api\/projects\/([^/]+)\/api-keys\/([^/]+)\/rotate$/);
  if (match && method === "POST") {
    const kid = match[2]!;
    apiKeys = apiKeys.map((k) => (k.id === kid ? { ...k, fingerprint: hex(24, Date.now() & 0xffff) } : k));
    return { apiKey: { id: kid, token: `pk_demo_${hex(32, (Date.now() >> 3) ^ 0x33)}` } } as T;
  }
  match = m(/^\/api\/projects\/([^/]+)\/api-keys\/([^/]+)$/);
  if (match && method === "DELETE") {
    const kid = match[2]!;
    apiKeys = apiKeys.map((k) => (k.id === kid ? { ...k, revoked_at: Date.now() } : k));
    return {} as T;
  }

  if (path === "/api/tunnels/disconnect" && method === "POST") {
    const tid = String((body as { tunnelId?: string })?.tunnelId ?? "");
    tunnelConnections = tunnelConnections.filter((t) => t.id !== tid);
    return {} as T;
  }
  if (path === "/api/tunnels") {
    const slug = q.get("projectSlug") ?? "";
    return { tunnels: tunnelConnections.filter((t) => t.projectSlug === slug) } as T;
  }

  if (path === "/api/metrics/projects-volume") {
    return { metrics: projectsVolume(q.get("window") ?? "7d") } as T;
  }
  match = m(/^\/api\/metrics\/project\/([^/]+)\/timeseries$/);
  if (match) {
    return { points: seededSeries((q.get("window") ?? "7d") === "24h" ? 24 : (q.get("window") ?? "7d") === "30d" ? 30 : 7, match[1]!.length * 131) } as T;
  }
  match = m(/^\/api\/metrics\/project\/([^/]+)\/status-codes-detailed$/);
  if (match) {
    return { metrics: metricsFor(match[1]!).statusDetails } as T;
  }
  match = m(/^\/api\/metrics\/project\/([^/]+)\/status-codes$/);
  if (match) {
    return { metrics: metricsFor(match[1]!).statusBuckets } as T;
  }
  match = m(/^\/api\/metrics\/project\/([^/]+)\/latency$/);
  if (match) {
    return { latency: metricsFor(match[1]!).latency } as T;
  }
  match = m(/^\/api\/metrics\/project\/([^/]+)\/delivery-health$/);
  if (match) {
    return { health: metricsFor(match[1]!).health } as T;
  }
  match = m(/^\/api\/metrics\/project\/([^/]+)\/ops$/);
  if (match) {
    const mm = metricsFor(match[1]!);
    return { summary: mm.opsSummary, alerts: mm.opsAlerts, rateLimitedSeries: seededSeries(14, 77), topFailingDestinations: mm.opsTopFailures } as T;
  }

  throw new Error(`DEMO-ONLY fixture backend: no route for ${method} ${path}`);
}

// DEMO-ONLY: entry point used by ./api.ts when VITE_DEMO=1.
export function demoRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    window.setTimeout(() => {
      try {
        const parsedBody = typeof body === "string" ? (JSON.parse(body) as unknown) : body;
        resolve(route<T>(method, path, parsedBody));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("demo error"));
      }
    }, LATENCY_MS + Math.random() * 140);
  });
}
