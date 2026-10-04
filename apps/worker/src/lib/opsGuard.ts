type GuardEnv = {
  DB: D1Database;
  RATE_LIMIT_PER_MINUTE_PROJECT?: string;
  RATE_LIMIT_PER_MINUTE_IP?: string;
  ALERT_WEBHOOK_URL?: string;
  ALERT_MIN_INTERVAL_MS?: string;
};

type RateLimitSnapshot = {
  projectCount: number;
  projectLimit: number;
  ipCount: number;
  ipLimit: number;
  exceeded: "project" | "ip" | null;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeIp(value: string | null): string {
  if (!value) return "unknown";
  return value.trim().slice(0, 80) || "unknown";
}

async function incrementAndReadCounter(env: GuardEnv, projectId: string, counterKey: string): Promise<number> {
  await env.DB.prepare(
    `INSERT INTO usage_counters (id, project_id, month_key, events_count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(project_id, month_key) DO UPDATE SET events_count = events_count + 1`
  )
    .bind(crypto.randomUUID(), projectId, counterKey)
    .run();

  const row = await env.DB.prepare("SELECT events_count FROM usage_counters WHERE project_id = ? AND month_key = ? LIMIT 1")
    .bind(projectId, counterKey)
    .first<{ events_count: number }>();
  return Number(row?.events_count ?? 0);
}

async function incrementCounter(env: GuardEnv, projectId: string, counterKey: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO usage_counters (id, project_id, month_key, events_count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(project_id, month_key) DO UPDATE SET events_count = events_count + 1`
  )
    .bind(crypto.randomUUID(), projectId, counterKey)
    .run();
}

export async function applyIngressRateLimit(
  env: GuardEnv,
  projectId: string,
  sourceIp: string | null
): Promise<RateLimitSnapshot> {
  const projectLimit = parsePositiveInt(env.RATE_LIMIT_PER_MINUTE_PROJECT, 1200);
  const ipLimit = parsePositiveInt(env.RATE_LIMIT_PER_MINUTE_IP, 240);
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const projectKey = `rl:project:${minuteBucket}`;
  const ipKey = `rl:ip:${normalizeIp(sourceIp)}:${minuteBucket}`;

  const [projectCount, ipCount] = await Promise.all([
    incrementAndReadCounter(env, projectId, projectKey),
    incrementAndReadCounter(env, projectId, ipKey)
  ]);

  let exceeded: "project" | "ip" | null = null;
  if (projectCount > projectLimit) exceeded = "project";
  else if (ipCount > ipLimit) exceeded = "ip";
  if (exceeded) {
    await incrementCounter(env, projectId, `rl_exceeded:${exceeded}:${minuteBucket}`);
  }

  return { projectCount, projectLimit, ipCount, ipLimit, exceeded };
}

type AlertPayload = {
  type: "delivery_failure" | "ingress_rate_limited";
  projectId: string;
  projectSlug: string;
  summary: string;
  details: Record<string, unknown>;
};

export async function sendOpsAlert(env: GuardEnv, payload: AlertPayload): Promise<void> {
  const webhookUrl = env.ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;

  const intervalMs = parsePositiveInt(env.ALERT_MIN_INTERVAL_MS, 300_000);
  const alertBucket = Math.floor(Date.now() / intervalMs);
  const dedupeKey = `alert:${payload.type}:${alertBucket}`;
  const sentInBucket = await incrementAndReadCounter(env, payload.projectId, dedupeKey);
  if (sentInBucket > 1) return;

  const body = {
    service: "payetonhook",
    severity: "warning",
    timestamp: new Date().toISOString(),
    ...payload
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch {
    // Alerting must never break webhook delivery path.
  }
}
