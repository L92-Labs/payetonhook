import { Hono, type Context } from "hono";
import { hashApiToken } from "../lib/auth";
import { verifyCliSessionToken } from "../lib/cliSessionToken";
import { verifyTunnelToken } from "../lib/tunnelToken";
import type { AppEnv } from "../types";

export const tunnelRouter = new Hono<AppEnv>();

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const getHubStub = (env: AppEnv["Bindings"]) =>
  env.TUNNEL_HUB.get(env.TUNNEL_HUB.idFromName("hub"));

const proxyToTunnel = async (
  stub: ReturnType<AppEnv["Bindings"]["TUNNEL_HUB"]["get"]>,
  path: string,
  init: RequestInit = {}
) => {
  const response = await stub.fetch(`https://tunnel${path}`, init);
  return new Response(response.body, response);
};

type TunnelAuth = {
  kind: "project" | "user";
  projectId?: string;
  projectSlug?: string;
  userId?: string;
};

async function getSubscriberById(
  stub: ReturnType<AppEnv["Bindings"]["TUNNEL_HUB"]["get"]>,
  id: string
): Promise<{ projectSlug: string } | null> {
  const response = await stub.fetch(`https://tunnel/subscriber?id=${encodeURIComponent(id)}`);
  if (!response.ok) return null;
  const body = (await response.json()) as { subscriber: { projectSlug: string } };
  return body.subscriber ?? null;
}

async function readTunnelAuth(c: Context<AppEnv>): Promise<TunnelAuth | null> {
  const apiKey = c.req.header("x-api-key");
  if (apiKey) {
    const keyHash = await hashApiToken(apiKey);
    const key = await c.env.DB.prepare(
      `SELECT p.id as project_id, p.slug as project_slug
       FROM api_keys k
       INNER JOIN projects p ON p.id = k.project_id
       WHERE (k.token = ? OR k.token_hash = ?)
         AND k.revoked_at IS NULL
       LIMIT 1`
    )
      .bind(apiKey, keyHash)
      .first<{ project_id: string; project_slug: string }>();
    if (!key) return null;
    return { kind: "project", projectId: key.project_id, projectSlug: key.project_slug };
  }

  const cliSessionToken = c.req.header("x-cli-session-token");
  if (cliSessionToken) {
    const payload = await verifyCliSessionToken(c.env.TUNNEL_TOKEN_SECRET, cliSessionToken);
    if (!payload) return null;
    return { kind: "user", userId: payload.userId };
  }

  const tunnelToken = c.req.header("x-tunnel-token");
  if (tunnelToken) {
    const payload = await verifyTunnelToken(c.env.TUNNEL_TOKEN_SECRET, tunnelToken);
    if (!payload) return null;
    return { kind: "project", projectId: payload.projectId, projectSlug: payload.projectSlug };
  }
  return null;
}

async function userCanAccessProjectSlug(env: AppEnv["Bindings"], userId: string, projectSlug: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT p.id
     FROM projects p
     INNER JOIN project_memberships pm ON pm.project_id = p.id
     WHERE p.slug = ? AND pm.user_id = ? AND p.archived_at IS NULL
     LIMIT 1`
  )
    .bind(projectSlug, userId)
    .first<{ id: string }>();
  return Boolean(row?.id);
}

async function ensureTunnelAttemptsTable(db: D1Database): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS tunnel_attempts (
      id TEXT PRIMARY KEY,
      tunnel_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      project_slug TEXT NOT NULL,
      target_url TEXT,
      device_label TEXT,
      source_ip TEXT,
      country TEXT,
      os TEXT,
      platform TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      status_code INTEGER,
      error_message TEXT,
      duration_ms INTEGER,
      attempted_at INTEGER NOT NULL
    )`
  ).run();
}

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

tunnelRouter.post("/tunnel/register", async (c) => {
  const auth = await readTunnelAuth(c);
  if (!auth) return c.text("Unauthorized tunnel access", 401);
  const raw = (await c.req.json()) as Record<string, unknown>;
  const requestedProjectSlug = typeof raw.projectSlug === "string" ? raw.projectSlug : null;
  if (!requestedProjectSlug) {
    return c.text("Project mismatch", 403);
  }
  if (auth.kind === "project" && requestedProjectSlug !== auth.projectSlug) {
    return c.text("Project mismatch", 403);
  }
  if (auth.kind === "user" && !(await userCanAccessProjectSlug(c.env, String(auth.userId), requestedProjectSlug))) {
    return c.text("Project mismatch", 403);
  }
  const enriched = {
    ...raw,
    userAgent: c.req.header("user-agent") ?? null,
    sourceIp: c.req.header("cf-connecting-ip") ?? null,
    country: c.req.header("cf-ipcountry") ?? null
  };
  return proxyToTunnel(getHubStub(c.env), "/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(enriched),
  })
});

tunnelRouter.post("/tunnel/unregister", async (c) =>
  (async () => {
    const auth = await readTunnelAuth(c);
    if (!auth) return c.text("Unauthorized tunnel access", 401);
    const body = (await c.req.json().catch(() => ({}))) as { id?: string };
    if (!body.id) return c.text("Missing tunnel id", 400);
    const stub = getHubStub(c.env);
    const sub = await getSubscriberById(stub, body.id);
    if (!sub) return c.text("Forbidden", 403);
    if (auth.kind === "project" && sub.projectSlug !== auth.projectSlug) return c.text("Forbidden", 403);
    if (auth.kind === "user" && !(await userCanAccessProjectSlug(c.env, String(auth.userId), sub.projectSlug))) {
      return c.text("Forbidden", 403);
    }
    return proxyToTunnel(stub, "/unregister", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  })()
);

tunnelRouter.get("/tunnel/list", async (c) =>
  proxyToTunnel(getHubStub(c.env), "/list")
);

tunnelRouter.get("/tunnel/pull/:id", async (c) =>
  (async () => {
    const auth = await readTunnelAuth(c);
    if (!auth) return c.text("Unauthorized tunnel access", 401);
    const id = c.req.param("id");
    const stub = getHubStub(c.env);
    const sub = await getSubscriberById(stub, id);
    if (!sub) return c.text("Forbidden", 403);
    if (auth.kind === "project" && sub.projectSlug !== auth.projectSlug) return c.text("Forbidden", 403);
    if (auth.kind === "user" && !(await userCanAccessProjectSlug(c.env, String(auth.userId), sub.projectSlug))) {
      return c.text("Forbidden", 403);
    }
    return proxyToTunnel(stub, `/pull?id=${encodeURIComponent(id)}&limit=10`);
  })()
);

tunnelRouter.post("/tunnel/report", async (c) => {
  const auth = await readTunnelAuth(c);
  if (!auth) return c.text("Unauthorized tunnel access", 401);
  const body = (await c.req.json().catch(() => ({}))) as {
    id?: string;
    eventId?: string;
    ok?: boolean;
    statusCode?: number | null;
    error?: string | null;
    durationMs?: number | null;
  };
  if (!body.id || !body.eventId || typeof body.ok !== "boolean") {
    return c.text("Invalid report payload", 400);
  }

  const stub = getHubStub(c.env);
  const subRes = await stub.fetch(`https://tunnel/subscriber?id=${encodeURIComponent(body.id)}`);
  if (!subRes.ok) {
    return c.text("Unknown tunnel", 404);
  }
  const subData = (await subRes.json()) as {
    subscriber: {
      id: string;
      projectSlug: string;
      targetUrl: string;
      deviceLabel?: string | null;
      sourceIp?: string | null;
      country?: string | null;
      os?: string | null;
      platform?: string | null;
    };
  };
  const subscriber = subData.subscriber;
  if (auth.kind === "project" && subscriber.projectSlug !== auth.projectSlug) return c.text("Forbidden", 403);
  if (auth.kind === "user" && !(await userCanAccessProjectSlug(c.env, String(auth.userId), subscriber.projectSlug))) {
    return c.text("Forbidden", 403);
  }

  const project = await c.env.DB.prepare("SELECT id FROM projects WHERE slug = ? LIMIT 1")
    .bind(subscriber.projectSlug)
    .first<{ id: string }>();
  if (!project) return c.text("Project not found", 404);

  const event = await c.env.DB.prepare("SELECT id FROM events WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(body.eventId, project.id)
    .first<{ id: string }>();
  if (!event) return c.text("Event not found for project", 404);

  await ensureTunnelAttemptsTable(c.env.DB);
  await c.env.DB.prepare(
    `INSERT INTO tunnel_attempts
     (id, tunnel_id, event_id, project_id, project_slug, target_url, device_label, source_ip, country, os, platform, success, status_code, error_message, duration_ms, attempted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      subscriber.id,
      body.eventId,
      project.id,
      subscriber.projectSlug,
      subscriber.targetUrl ?? null,
      subscriber.deviceLabel ?? null,
      subscriber.sourceIp ?? null,
      subscriber.country ?? null,
      subscriber.os ?? null,
      subscriber.platform ?? null,
      body.ok ? 1 : 0,
      typeof body.statusCode === "number" ? body.statusCode : null,
      body.error ? String(body.error).slice(0, 1000) : null,
      typeof body.durationMs === "number" ? Math.max(0, Math.floor(body.durationMs)) : null,
      Date.now()
    )
    .run();

  await stub.fetch("https://tunnel/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: body.id, ok: body.ok, error: body.error ?? null })
  });

  return c.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

export async function dispatchToTunnel(
  env: AppEnv["Bindings"],
  projectSlug: string,
  endpointPath: string,
  sourceEventId: string,
  payload: string,
  headers: Record<string, string>
): Promise<void> {
  await getHubStub(env).fetch("https://tunnel/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectSlug, endpointPath, sourceEventId, payload, headers }),
  });
}
