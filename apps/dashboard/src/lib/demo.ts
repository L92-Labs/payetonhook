// DEMO-ONLY: in-memory fixture backend for `VITE_DEMO=1` preview builds.
// Never contacted in normal builds; strictly gated in lib/api.ts.

import type {
  ApiKeyRow,
  AttemptRow,
  EventPageInfo,
  EventRow,
  LatencyMetric,
  ProjectEndpointRow,
  ProjectRow,
  ProjectsVolumeMetric,
  StatusBucketMetric,
  TimeseriesPoint,
  TunnelAttemptRow,
  TunnelConnection
} from "../pages/dashboard/types";

export const DEMO_API_BASE = "https://demo.payetonhook.l92-labs.com";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.now();
const PAGE_SIZE = 12;

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function later<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

const demoProjects: ProjectRow[] = [
  {
    id: "prj_checkout_core",
    slug: "checkout-core",
    name: "Checkout Core",
    retention_days: 30,
    plan_tier: "free",
    primary_forward_url: "https://api.checkout.internal/hooks/payetonhook"
  },
  {
    id: "prj_github_ops",
    slug: "github-ops",
    name: "GitHub Ops",
    retention_days: 14,
    plan_tier: "free",
    primary_forward_url: null
  },
  {
    id: "prj_stripe_sandbox",
    slug: "stripe-sandbox",
    name: "Stripe Sandbox",
    retention_days: 7,
    plan_tier: "free",
    primary_forward_url: "https://stripe-mock.local/webhook"
  }
];

const demoEndpoints: Record<string, ProjectEndpointRow[]> = {
  prj_checkout_core: [
    {
      id: "epd_checkout_alt",
      project_id: "prj_checkout_core",
      name: "Alt route",
      path: "checkout-alt",
      forward_url: "https://api.checkout.internal/hooks/alt",
      active: 1,
      created_at: NOW - 18 * DAY,
      updated_at: NOW - 4 * DAY
    }
  ],
  prj_github_ops: [
    {
      id: "epd_gh_pr",
      project_id: "prj_github_ops",
      name: "Pull requests",
      path: "gh-pr",
      forward_url: null,
      active: 1,
      created_at: NOW - 11 * DAY,
      updated_at: NOW - 11 * DAY
    }
  ],
  prj_stripe_sandbox: [
    {
      id: "epd_stripe_mock",
      project_id: "prj_stripe_sandbox",
      name: "Mock receiver",
      path: "stripe-mock",
      forward_url: "http://localhost:9090/stripe",
      active: 1,
      created_at: NOW - 6 * DAY,
      updated_at: NOW - 2 * DAY
    }
  ]
};

const demoApiKeys: Record<string, ApiKeyRow[]> = {
  prj_checkout_core: [
    {
      id: "key_ci_local",
      label: "local dev",
      created_at: NOW - 21 * DAY,
      revoked_at: null,
      fingerprint: "a41c77e02b9d5f63"
    },
    {
      id: "key_ci_pipeline",
      label: "ci pipeline",
      created_at: NOW - 9 * DAY,
      revoked_at: null,
      fingerprint: "6bd209fe4c81a730"
    },
    {
      id: "key_ci_old",
      label: "legacy",
      created_at: NOW - 40 * DAY,
      revoked_at: NOW - 12 * DAY,
      fingerprint: "cf9013ab57d2e684"
    }
  ],
  prj_github_ops: [
    {
      id: "key_gh_bot",
      label: "hook bot",
      created_at: NOW - 15 * DAY,
      revoked_at: null,
      fingerprint: "1e7f30ca98b4d251"
    }
  ],
  prj_stripe_sandbox: [
    {
      id: "key_st_mock",
      label: "Default",
      created_at: NOW - 5 * DAY,
      revoked_at: null,
      fingerprint: "83a45c0fd19e7b26"
    }
  ]
};

type PayloadKind = "stripe" | "push" | "checkout" | "alert" | "ping";

type EventSpec = {
  project: string;
  id: string;
  minutesAgo: number;
  kind: PayloadKind;
  method?: "POST" | "GET";
  endpointPath?: string | null;
  replayOf?: string;
  attempts: Array<{ code: number | null; ok: 0 | 1; error?: string }>;
};

const eventSpecs: EventSpec[] = [
  { project: "prj_checkout_core", id: "evt_9f2c41a07b3e", minutesAgo: 2, kind: "checkout", attempts: [{ code: 202, ok: 1 }] },
  { project: "prj_checkout_core", id: "evt_51d8e9a2f604", minutesAgo: 9, kind: "alert", attempts: [{ code: 200, ok: 1 }] },
  { project: "prj_checkout_core", id: "evt_c44b0f7d2e18", minutesAgo: 24, kind: "checkout", endpointPath: "checkout-alt", attempts: [{ code: 502, ok: 0, error: "connect ECONNREFUSED 10.0.4.17:443" }, { code: 200, ok: 1 }] },
  { project: "prj_checkout_core", id: "evt_0a93e5b71c26", minutesAgo: 41, kind: "checkout", attempts: [{ code: 202, ok: 1 }] },
  { project: "prj_checkout_core", id: "evt_7f1d68c30a95", minutesAgo: 67, kind: "alert", attempts: [{ code: 200, ok: 1 }] },
  { project: "prj_checkout_core", id: "evt_b8e247f9d051", minutesAgo: 95, kind: "checkout", attempts: [{ code: null, ok: 0, error: "delivery timeout after 3 retries" }] },
  { project: "prj_checkout_core", id: "evt_3ac0915e6f72", minutesAgo: 130, kind: "checkout", replayOf: "evt_0a93e5b71c26", attempts: [{ code: 202, ok: 1 }] },
  { project: "prj_checkout_core", id: "evt_e60d3b48c917", minutesAgo: 180, kind: "checkout", attempts: [{ code: 202, ok: 1 }] },
  { project: "prj_checkout_core", id: "evt_24f7a0e59b83", minutesAgo: 260, kind: "alert", attempts: [{ code: 500, ok: 0, error: "internal error while decoding signature" }] },
  { project: "prj_checkout_core", id: "evt_98b5c1f206ad", minutesAgo: 340, kind: "checkout", attempts: [{ code: 202, ok: 1 }] },
  { project: "prj_checkout_core", id: "evt_d0734e9a1b56", minutesAgo: 420, kind: "checkout", attempts: [{ code: 202, ok: 1 }] },
  { project: "prj_checkout_core", id: "evt_4c81f0d37e29", minutesAgo: 510, kind: "alert", attempts: [{ code: 200, ok: 1 }] },
  { project: "prj_checkout_core", id: "evt_a39b76c20e84", minutesAgo: 1220, kind: "checkout", attempts: [{ code: 202, ok: 1 }] },
  { project: "prj_checkout_core", id: "evt_6f2d90b45c71", minutesAgo: 1500, kind: "checkout", endpointPath: "checkout-alt", attempts: [{ code: 200, ok: 1 }] },
  { project: "prj_checkout_core", id: "evt_85c0e1f9a326", minutesAgo: 2100, kind: "checkout", attempts: [{ code: 202, ok: 1 }] },
  { project: "prj_checkout_core", id: "evt_1b74ad6098e2", minutesAgo: 2900, kind: "alert", attempts: [{ code: 200, ok: 1 }] },
  { project: "prj_checkout_core", id: "evt_f09c3d85b147", minutesAgo: 4300, kind: "checkout", attempts: [{ code: 202, ok: 1 }] },
  { project: "prj_checkout_core", id: "evt_52e6a08c9d30", minutesAgo: 5700, kind: "checkout", attempts: [{ code: 202, ok: 1 }] },
  { project: "prj_github_ops", id: "evt_10a4f8c2be9d", minutesAgo: 6, kind: "push", attempts: [{ code: 200, ok: 1 }] },
  { project: "prj_github_ops", id: "evt_77c9d1e4a03f", minutesAgo: 55, kind: "ping", method: "GET", attempts: [{ code: 200, ok: 1 }] },
  { project: "prj_github_ops", id: "evt_2e8b60f5cd19", minutesAgo: 140, kind: "push", endpointPath: "gh-pr", attempts: [{ code: 404, ok: 0, error: "no route registered for POST /hooks/pr" }] },
  { project: "prj_github_ops", id: "evt_b5a0937e1c68", minutesAgo: 320, kind: "push", attempts: [{ code: 200, ok: 1 }] },
  { project: "prj_github_ops", id: "evt_63f8d2c04a71", minutesAgo: 780, kind: "push", attempts: [{ code: 200, ok: 1 }] },
  { project: "prj_github_ops", id: "evt_9c4e17b3d085", minutesAgo: 1600, kind: "push", endpointPath: "gh-pr", attempts: [{ code: 200, ok: 1 }] },
  { project: "prj_github_ops", id: "evt_48d1f6a9c23e", minutesAgo: 2400, kind: "ping", method: "GET", attempts: [{ code: 200, ok: 1 }] },
  { project: "prj_github_ops", id: "evt_a7c25e80b914", minutesAgo: 3800, kind: "push", attempts: [{ code: 200, ok: 1 }] },
  { project: "prj_stripe_sandbox", id: "evt_stripe_0001", minutesAgo: 14, kind: "stripe", attempts: [{ code: 200, ok: 1 }] },
  { project: "prj_stripe_sandbox", id: "evt_stripe_0002", minutesAgo: 88, kind: "stripe", endpointPath: "stripe-mock", attempts: [{ code: null, ok: 0, error: "connect ECONNREFUSED 127.0.0.1:9090" }] },
  { project: "prj_stripe_sandbox", id: "evt_stripe_0003", minutesAgo: 200, kind: "stripe", attempts: [{ code: 200, ok: 1 }] },
  { project: "prj_stripe_sandbox", id: "evt_stripe_0004", minutesAgo: 460, kind: "stripe", replayOf: "evt_stripe_0002", attempts: [{ code: 200, ok: 1 }] },
  { project: "prj_stripe_sandbox", id: "evt_stripe_0005", minutesAgo: 2600, kind: "stripe", attempts: [{ code: 200, ok: 1 }] }
];

const payloadByKind: Record<PayloadKind, string> = {
  stripe: JSON.stringify(
    {
      id: "evt_1PdemoStripe01",
      object: "event",
      api_version: "2024-06-20",
      type: "invoice.finalized",
      livemode: false,
      data: {
        object: {
          id: "in_demo_0001",
          customer: "cus_demo_77",
          status: "open",
          currency: "eur",
          amount_due: 4200,
          total: 4200,
          hosted_invoice_url: "https://invoice.stripe.com/i/demo_0001",
          lines: {
            object: "list",
            data: [
              { id: "il_demo_0001", description: "1 × Payetonhook relay (monthly)", amount: 4200, quantity: 1, currency: "eur" }
            ]
          }
        }
      }
    },
    null,
    2
  ),
  push: JSON.stringify(
    {
      ref: "refs/heads/main",
      before: "0a1b982cf5de40a1b982cf5de40a1b982cf5de40a",
      after: "f4e5d0c31a9b7e8cf2d0a4b6c8e1f3a5d7b9c0e2",
      repository: { id: 702118944, name: "payetonhook", full_name: "L92-Labs/payetonhook", private: false, default_branch: "main" },
      pusher: { name: "loiu92", email: "loiu92@gmail.com" },
      commits: [
        {
          id: "f4e5d0c31a9b7e8cf2d0a4b6c8e1f3a5d7b9c0e2",
          message: "fix(relay): exponential backoff on 502 responses",
          author: { name: "loiu92" },
          added: ["apps/relay/src/backoff.ts"],
          removed: [],
          modified: ["apps/relay/src/forwarder.ts"]
        }
      ]
    },
    null,
    2
  ),
  checkout: JSON.stringify(
    {
      type: "checkout.session.completed",
      livemode: false,
      sessionId: "cs_demo_a1b2c3",
      order: { reference: "ORD-2041", total: 89.9, currency: "EUR", items: 3 },
      customer: { id: "cus_2041", email: "kai@example.com", locale: "fr-FR" },
      payment_method: "card",
      received_at: "2026-10-04T09:41:22Z"
    },
    null,
    2
  ),
  alert: JSON.stringify(
    {
      alert: "latency-p99-high",
      status: "firing",
      labels: { service: "checkout-core", severity: "warning", environment: "production" },
      annotations: { summary: "p99 latency above 800ms for 5 minutes" },
      startsAt: "2026-10-04T09:12:00Z",
      endsAt: "0001-01-01T00:00:00Z",
      generatorURL: "https://grafana.internal/checkout-core/latency"
    },
    null,
    2
  ),
  ping: ""
};

const queryParamsByKind: Partial<Record<PayloadKind, Record<string, string | string[]>>> = {
  ping: { "hub.mode": "subscribe", "hub.challenge": "1158201444", "hub.verify_token": "payetonhook-demo", zen: "Design for failure." }
};

type DemoEvent = {
  row: EventRow;
  kind: PayloadKind;
  attempts: AttemptRow[];
};

const demoEvents: DemoEvent[] = eventSpecs
  .map((spec, index) => {
    const project = demoProjects.find((p) => p.id === spec.project)!;
    const receivedAt = NOW - spec.minutesAgo * MINUTE;
    return {
      row: {
        id: spec.id,
        project_id: spec.project,
        project_slug: project.slug,
        endpoint_path: spec.endpointPath ?? null,
        replay: spec.replayOf !== undefined,
        r2_key: `projects/${spec.project}/events/${spec.id}.json`,
        replay_of_event_id: spec.replayOf ?? null,
        request_method: spec.method ?? "POST",
        received_at: receivedAt
      } satisfies EventRow,
      kind: spec.kind,
      attempts: spec.attempts.map((attempt, attemptIndex) => ({
        id: `att_${spec.id.slice(4)}_${attemptIndex + 1}`,
        attempt_no: attemptIndex + 1,
        status_code: attempt.code,
        success: attempt.ok,
        error_message: attempt.error ?? null,
        attempted_at: receivedAt + attemptIndex * 9_000 + index * 137
      }))
    };
  })
  .sort((a, b) => b.row.received_at - a.row.received_at);

const tunnelAttemptsByEvent: Record<string, TunnelAttemptRow[]> = {};
for (const event of demoEvents) {
  if (event.row.project_slug === "checkout-core" && event.row.received_at > NOW - 6 * HOUR) {
    tunnelAttemptsByEvent[event.row.id] = [
      {
        tunnel_id: "tnl_macbook_m3",
        target_url: "http://localhost:3000/webhooks",
        device_label: "macbook-pro-m3",
        source_ip: "82.65.118.42",
        country: "FR",
        os: "darwin",
        platform: "node",
        success: event.attempts[0]?.success ?? 0,
        status_code: event.attempts[0]?.status_code ?? null,
        error_message: event.attempts[0]?.error_message ?? null,
        duration_ms: 40 + Math.floor(lcg(event.row.received_at)() * 380),
        attempted_at: event.row.received_at + 1_200
      }
    ];
  }
}

const demoTunnels: TunnelConnection[] = [
  {
    id: "tnl_macbook_m3",
    projectSlug: "checkout-core",
    workerUrl: "wss://edge-eu.payetonhook.l92-labs.com/tunnel/tnl_macbook_m3",
    targetUrl: "http://localhost:3000/webhooks",
    deviceLabel: "macbook-pro-m3",
    hostname: "macbook-pro-m3.local",
    os: "darwin 24.5.0",
    platform: "node 22.2.0",
    nodeVersion: "v22.2.0",
    sourceIp: "82.65.118.42",
    country: "FR",
    connectedAt: NOW - 5 * HOUR,
    lastActivity: NOW - 3 * MINUTE,
    eventsForwarded: 214,
    deliveriesOk: 207,
    deliveriesFailed: 7,
    success24h: 118,
    failed24h: 3,
    lastError: "ECONNREFUSED 127.0.0.1:3000 during event evt_b8e247f9d051",
    status: "live"
  },
  {
    id: "tnl_ci_runner",
    projectSlug: "checkout-core",
    workerUrl: "wss://edge-eu.payetonhook.l92-labs.com/tunnel/tnl_ci_runner",
    targetUrl: "http://localhost:4000/hooks",
    deviceLabel: "ci-runner-07",
    hostname: "ci-runner-07.l92.internal",
    os: "linux 6.8.0",
    platform: "node 20.14.0",
    nodeVersion: "v20.14.0",
    sourceIp: "51.75.20.144",
    country: "DE",
    connectedAt: NOW - 2 * DAY,
    lastActivity: NOW - 20 * HOUR,
    eventsForwarded: 96,
    deliveriesOk: 90,
    deliveriesFailed: 6,
    success24h: 0,
    failed24h: 0,
    lastError: "tunnel closed by peer (heartbeat missed)",
    status: "stale"
  },
  {
    id: "tnl_gh_bot",
    projectSlug: "github-ops",
    workerUrl: "wss://edge-eu.payetonhook.l92-labs.com/tunnel/tnl_gh_bot",
    targetUrl: "http://localhost:8080/gh",
    deviceLabel: "hook-bot",
    hostname: "hook-bot.l92.internal",
    os: "darwin 23.4.0",
    platform: "bun 1.1.18",
    nodeVersion: null,
    sourceIp: "82.65.118.42",
    country: "FR",
    connectedAt: NOW - 9 * HOUR,
    lastActivity: NOW - 55 * MINUTE,
    eventsForwarded: 38,
    deliveriesOk: 38,
    deliveriesFailed: 0,
    success24h: 12,
    failed24h: 0,
    lastError: null,
    status: "idle"
  }
];

function projectEvents(projectId: string): DemoEvent[] {
  return demoEvents.filter((event) => event.row.project_id === projectId);
}

function attemptsOf(projectId: string): AttemptRow[] {
  return projectEvents(projectId).flatMap((event) => event.attempts);
}

function windowParam(query: URLSearchParams): "24h" | "7d" | "30d" {
  const value = query.get("window");
  return value === "24h" || value === "30d" ? value : "7d";
}

function series(seed: number, window: "24h" | "7d" | "30d", base: number, spread: number): TimeseriesPoint[] {
  const buckets = window === "24h" ? 24 : window === "7d" ? 7 : 30;
  const step = window === "24h" ? HOUR : DAY;
  const start = Math.floor((NOW - buckets * step) / step) * step;
  const rand = lcg(seed);
  return Array.from({ length: buckets }, (_, index) => ({
    bucket_start: start + index * step,
    count: Math.max(0, Math.round(base + (rand() - 0.5) * spread))
  }));
}

function statusBucketsOf(projectId: string): StatusBucketMetric[] {
  const attempts = attemptsOf(projectId);
  const counts: Record<StatusBucketMetric["bucket"], number> = {
    http_2xx: 0,
    http_4xx: 0,
    http_5xx: 0,
    timeout_or_network: 0
  };
  for (const attempt of attempts) {
    if (attempt.success === 1 && (attempt.status_code ?? 200) < 300) counts.http_2xx += 1;
    else if (attempt.status_code === null) counts.timeout_or_network += 1;
    else if (attempt.status_code >= 500) counts.http_5xx += 1;
    else counts.http_4xx += 1;
  }
  const total = Math.max(1, attempts.length);
  return (Object.keys(counts) as Array<StatusBucketMetric["bucket"]>)
    .map((bucket) => ({
      bucket,
      count: counts[bucket],
      percentage: Math.round((counts[bucket] / total) * 100)
    }))
    .filter((bucket) => bucket.count > 0);
}

function detailedCodesOf(projectId: string) {
  const counts = new Map<string, number>();
  for (const attempt of attemptsOf(projectId)) {
    const code = String(attempt.status_code ?? "timeout");
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const total = Math.max(1, attemptsOf(projectId).length);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, count, percentage: Math.round((count / total) * 100) }));
}

function healthOf(projectId: string) {
  const attempts = attemptsOf(projectId);
  const ok = attempts.filter((a) => a.success === 1).length;
  const failed = attempts.length - ok;
  return {
    successCount: ok,
    failedCount: failed,
    successRate: attempts.length ? Math.round((ok / attempts.length) * 100) : 100
  };
}

const latencyByProject: Record<string, LatencyMetric> = {
  prj_checkout_core: { p50: 42, p95: 180, p99: 320, avg: 61, max: 1904 },
  prj_github_ops: { p50: 28, p95: 96, p99: 148, avg: 39, max: 611 },
  prj_stripe_sandbox: { p50: 55, p95: 240, p99: 512, avg: 88, max: 2812 }
};

function failIdCounter(seed: number): () => number {
  const rand = lcg(seed);
  return () => Math.floor(rand() * 9000 + 1000);
}

let endpointCounter = 0;
let keyCounter = 0;

function parseBody(options?: RequestInit): Record<string, unknown> {
  if (!options?.body) return {};
  try {
    return JSON.parse(String(options.body)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "project"
  );
}

async function route<T>(path: string, options?: RequestInit): Promise<T> {
  const [rawPathname, rawQuery] = path.split("?");
  const pathname = rawPathname.replace(/\/+$/, "") || "/";
  const query = new URLSearchParams(rawQuery ?? "");
  const method = (options?.method ?? "GET").toUpperCase();
  const body = parseBody(options);
  const latency = 90 + Math.floor(lcg(pathname.length * 31 + method.charCodeAt(0))() * 180);

  const json = (value: unknown) => later(value, latency) as Promise<T>;

  if (pathname === "/api/me") {
    return json({
      user: { id: "usr_demo_operator", name: "Demo Operator", email: "demo@payetonhook.dev", picture: "" }
    });
  }

  if (pathname === "/api/logout") {
    return json({ ok: true });
  }

  if (pathname === "/api/projects" && method === "GET") {
    return json({ projects: demoProjects });
  }

  if (pathname === "/api/projects" && method === "POST") {
    const name = String(body.name ?? "New Project");
    const project: ProjectRow = {
      id: `prj_${slugify(name)}_${Date.now().toString(36)}`,
      slug: slugify(name),
      name,
      retention_days: 14,
      plan_tier: "free",
      primary_forward_url: null
    };
    demoProjects.push(project);
    demoEndpoints[project.id] = [];
    demoApiKeys[project.id] = [];
    return json({ project });
  }

  let match = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (match) {
    const projectId = match[1];
    const index = demoProjects.findIndex((p) => p.id === projectId);
    if (method === "PATCH" && index >= 0) {
      demoProjects[index] = {
        ...demoProjects[index],
        name: typeof body.name === "string" ? body.name : demoProjects[index].name,
        primary_forward_url:
          body.primary_forward_url === undefined ? demoProjects[index].primary_forward_url : (body.primary_forward_url as string | null)
      };
      return json({ project: demoProjects[index] });
    }
    if (method === "DELETE" && index >= 0) {
      demoProjects.splice(index, 1);
      return json({ ok: true });
    }
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/events$/);
  if (match && method === "GET") {
    const rows = projectEvents(match[1]).map((event) => event.row);
    const before = query.get("before");
    const startIndex = before ? rows.findIndex((row) => row.id === before) + 1 : 0;
    const safeStart = startIndex <= 0 && before ? rows.length : Math.max(0, startIndex);
    const page = rows.slice(safeStart, safeStart + PAGE_SIZE);
    const pageInfo: EventPageInfo = {
      nextCursor: page.length ? page[page.length - 1].id : null,
      hasMore: safeStart + page.length < rows.length
    };
    return json({ events: page, pageInfo });
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/events\/([^/]+)\/attempts$/);
  if (match && method === "GET") {
    const eventId = match[2];
    const event = demoEvents.find((candidate) => candidate.row.id === eventId);
    return json({ attempts: event?.attempts ?? [] });
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/events\/([^/]+)\/payload$/);
  if (match && method === "GET") {
    const eventId = match[2];
    const event = demoEvents.find((candidate) => candidate.row.id === eventId);
    if (!event) return json({ payload: "" });
    return json({
      payload: payloadByKind[event.kind],
      method: event.row.request_method ?? "POST",
      queryParams: event.kind === "ping" ? queryParamsByKind.ping : undefined,
      endpointPath: event.row.endpoint_path ?? event.row.project_slug,
      replay: event.row.replay === true
    });
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/events\/([^/]+)\/tunnels$/);
  if (match && method === "GET") {
    return json({ tunnels: tunnelAttemptsByEvent[match[2]] ?? [] });
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/events\/([^/]+)\/replay$/);
  if (match && method === "POST") {
    const eventId = match[2];
    const source = demoEvents.find((candidate) => candidate.row.id === eventId);
    if (source) {
      const replayRow: EventRow = {
        ...source.row,
        id: `${source.row.id}_r${Date.now().toString(36).slice(-4)}`,
        replay: true,
        replay_of_event_id: source.row.id,
        received_at: Date.now()
      };
      const replayAttempts: AttemptRow[] = [
        {
          id: `att_replay_${Date.now().toString(36)}`,
          attempt_no: 1,
          status_code: 202,
          success: 1,
          error_message: null,
          attempted_at: Date.now()
        }
      ];
      demoEvents.unshift({ row: replayRow, kind: source.kind, attempts: replayAttempts });
    }
    return json({ ok: true });
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/api-keys$/);
  if (match && method === "GET") {
    return json({ apiKeys: demoApiKeys[match[1]] ?? [] });
  }
  if (match && method === "POST") {
    const projectId = match[1];
    const id = `key_demo_${++keyCounter}`;
    const fingerprint = Math.floor(lcg(Date.now() & 0xffff)() * 0xffffffffffff)
      .toString(16)
      .padStart(12, "0")
      .slice(0, 16);
    demoApiKeys[projectId] = [
      ...(demoApiKeys[projectId] ?? []),
      { id, label: String(body.label ?? "Default"), created_at: Date.now(), revoked_at: null, fingerprint }
    ];
    return json({ apiKey: { id, token: `pkh_demo_${fingerprint}${Date.now().toString(36)}` } });
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/api-keys\/([^/]+)\/rotate$/);
  if (match && method === "POST") {
    const projectId = match[1];
    const keyId = match[2];
    const key = (demoApiKeys[projectId] ?? []).find((candidate) => candidate.id === keyId);
    if (key) {
      key.fingerprint = Math.floor(lcg(Date.now() & 0xffff)() * 0xffffffffffff)
        .toString(16)
        .padStart(12, "0")
        .slice(0, 16);
      return json({ apiKey: { id: key.id, token: `pkh_demo_${key.fingerprint}${Date.now().toString(36)}` } });
    }
    return json({ apiKey: { id: keyId, token: "pkh_demo_rotated" } });
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/api-keys\/([^/]+)$/);
  if (match && method === "DELETE") {
    const projectId = match[1];
    const keyId = match[2];
    const keys = demoApiKeys[projectId] ?? [];
    const key = keys.find((candidate) => candidate.id === keyId);
    if (key) key.revoked_at = Date.now();
    return json({ ok: true });
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/endpoints$/);
  if (match && method === "GET") {
    return json({ endpoints: demoEndpoints[match[1]] ?? [] });
  }
  if (match && method === "POST") {
    const projectId = match[1];
    const endpoint: ProjectEndpointRow = {
      id: `epd_demo_${++endpointCounter}`,
      project_id: projectId,
      name: String(body.name ?? "Endpoint"),
      path: String(body.path ?? "path"),
      forward_url: (body.forward_url as string | null) ?? null,
      active: 1,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    demoEndpoints[projectId] = [...(demoEndpoints[projectId] ?? []), endpoint];
    return json({ endpoint });
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/endpoints\/([^/]+)$/);
  if (match) {
    const endpointId = match[2];
    const endpoints = demoEndpoints[match[1]] ?? [];
    const index = endpoints.findIndex((candidate) => candidate.id === endpointId);
    if (method === "PATCH" && index >= 0) {
      endpoints[index] = {
        ...endpoints[index],
        name: typeof body.name === "string" ? body.name : endpoints[index].name,
        path: typeof body.path === "string" ? body.path : endpoints[index].path,
        forward_url:
          body.forward_url === undefined ? endpoints[index].forward_url : (body.forward_url as string | null),
        updated_at: Date.now()
      };
      return json({ endpoint: endpoints[index] });
    }
    if (method === "DELETE" && index >= 0) {
      endpoints.splice(index, 1);
      return json({ ok: true });
    }
  }

  if (pathname === "/api/tunnels" && method === "GET") {
    const projectSlug = query.get("projectSlug");
    return json({ tunnels: demoTunnels.filter((tunnel) => tunnel.projectSlug === projectSlug) });
  }

  if (pathname === "/api/tunnels/disconnect" && method === "POST") {
    const tunnelId = String(body.tunnelId ?? "");
    const index = demoTunnels.findIndex((tunnel) => tunnel.id === tunnelId);
    if (index >= 0) demoTunnels.splice(index, 1);
    return json({ ok: true });
  }

  if (pathname === "/api/metrics/projects-volume" && method === "GET") {
    const metrics: ProjectsVolumeMetric[] = demoProjects.map((project) => ({
      project_id: project.id,
      project_slug: project.slug,
      project_name: project.name,
      count: projectEvents(project.id).length * 37 + 41
    }));
    return json({ metrics });
  }

  match = pathname.match(/^\/api\/metrics\/project\/([^/]+)\/timeseries$/);
  if (match && method === "GET") {
    const window = windowParam(query);
    const seed = match[1].length * 977 + window.length * 31;
    const base = { "24h": 14, "7d": 62, "30d": 58 }[window];
    const spread = { "24h": 18, "7d": 44, "30d": 52 }[window];
    return json({ points: series(seed, window, base, spread) });
  }

  match = pathname.match(/^\/api\/metrics\/project\/([^/]+)\/status-codes$/);
  if (match && method === "GET") {
    return json({ metrics: statusBucketsOf(match[1]) });
  }

  match = pathname.match(/^\/api\/metrics\/project\/([^/]+)\/status-codes-detailed$/);
  if (match && method === "GET") {
    return json({ metrics: detailedCodesOf(match[1]) });
  }

  match = pathname.match(/^\/api\/metrics\/project\/([^/]+)\/latency$/);
  if (match && method === "GET") {
    return json({ latency: latencyByProject[match[1]] ?? latencyByProject.prj_checkout_core });
  }

  match = pathname.match(/^\/api\/metrics\/project\/([^/]+)\/delivery-health$/);
  if (match && method === "GET") {
    return json({ health: healthOf(match[1]) });
  }

  match = pathname.match(/^\/api\/metrics\/project\/([^/]+)\/ops$/);
  if (match && method === "GET") {
    const window = windowParam(query);
    const nextId = failIdCounter(match[1].length * 613 + 7);
    const events = projectEvents(match[1]);
    const deadLetters = events.filter((event) => event.attempts.some((attempt) => attempt.success === 0)).length;
    const tunnelErrors = demoTunnels
      .filter((tunnel) => tunnel.projectSlug === events[0]?.row.project_slug)
      .reduce((sum, tunnel) => sum + tunnel.failed24h, 0);
    const destinations = new Map<string, { failed: number; total: number }>();
    for (const event of events) {
      const name = event.row.endpoint_path ? `/${event.row.endpoint_path}` : "/primary";
      const entry = destinations.get(name) ?? { failed: 0, total: 0 };
      entry.total += event.attempts.length;
      entry.failed += event.attempts.filter((attempt) => attempt.success === 0).length;
      destinations.set(name, entry);
    }
    return json({
      summary: {
        ingressCount: events.length * 37 + 41,
        rateLimitedCount: 23,
        rateLimitedProject: 9,
        rateLimitedIp: 14
      },
      alerts: { dead_letters: deadLetters, tunnel_errors: tunnelErrors, csrf_rejections: 2 },
      rateLimitedSeries: series(match[1].length * 131, window, 2, 4),
      topFailingDestinations: [...destinations.entries()]
        .filter(([, value]) => value.failed > 0)
        .map(([name, value]) => ({
          destinationId: `dst_${nextId()}`,
          destinationName: name,
          failedCount: value.failed,
          totalCount: value.total,
          failureRate: Math.round((value.failed / Math.max(1, value.total)) * 100)
        }))
    });
  }

  throw new Error(`demo: no route for ${method} ${pathname}`);
}

export function demoRequest<T>(path: string, options?: RequestInit): Promise<T> {
  return route<T>(path, options);
}
