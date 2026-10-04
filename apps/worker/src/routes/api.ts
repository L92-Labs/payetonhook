import { Hono } from "hono";
import type { EnqueuedWebhookEvent } from "@payetonhook/shared";
import { getAllowedOrigins, getSessionUserFromRequest, hashApiToken, parseCookieHeader, pickOrigin, randomToken, setCookie } from "../lib/auth";
import { signCliSessionToken, verifyCliSessionToken } from "../lib/cliSessionToken";
import { D1Repositories } from "../lib/db";
import { getEventPayload } from "../lib/r2";
import { signTunnelToken } from "../lib/tunnelToken";
import { dispatchToTunnel } from "./tunnel";
import type { AppEnv } from "../types";

const CSRF_COOKIE_NAME = "ph_csrf";
const SESSION_COOKIE_NAME = "ph_session";
const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CLI_SESSION_TTL_SECONDS = 365 * 24 * 60 * 60;

export const apiRouter = new Hono<AppEnv>();

type ProjectEndpointRow = {
  id: string;
  project_id: string;
  name: string;
  path: string;
  forward_url: string | null;
  active: number;
  created_at: number;
  updated_at: number;
};

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

function randomUserCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

apiRouter.use("/api/*", async (c, next) => {
  const allowedOrigins = getAllowedOrigins(c.env);
  const allowedOrigin = pickOrigin(c.req.raw.headers, allowedOrigins);
  if (allowedOrigin) {
    c.header("Access-Control-Allow-Origin", allowedOrigin);
    c.header("Vary", "Origin");
    c.header("Access-Control-Allow-Credentials", "true");
  }
  c.header("Access-Control-Expose-Headers", "x-csrf-token");
  c.header("Access-Control-Allow-Headers", "content-type, x-csrf-token");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: c.res.headers });
  }
  return next();
});

apiRouter.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/machine/") || c.req.path.startsWith("/api/cli/device/")) {
    return next();
  }
  const user = await getSessionUserFromRequest(c.env, c.req.raw);
  if (!user) {
    return c.text("Unauthorized", 401);
  }
  c.set("userId", user.id);
  c.set("userEmail", user.email);
  c.set("userName", user.name);
  c.set("userPicture", user.picture_url ?? "");

  const cookies = parseCookieHeader(c.req.header("cookie") ?? null);
  let csrf = cookies[CSRF_COOKIE_NAME];
  if (!csrf) {
    csrf = randomToken(16);
    c.header(
      "Set-Cookie",
      setCookie(CSRF_COOKIE_NAME, csrf, {
        Path: "/",
        HttpOnly: false,
        Secure: true,
        SameSite: "None",
        "Max-Age": 60 * 60 * 24 * 30
      })
    );
  }
  // Expose token to browser clients on every authenticated response.
  c.header("x-csrf-token", csrf);

  if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
    const headerToken = c.req.header("x-csrf-token");
    if (!headerToken || headerToken !== csrf) {
      return c.text("Invalid CSRF token", 403);
    }
  }
  return next();
});

async function getMembershipRole(env: AppEnv["Bindings"], userId: string, projectId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT role FROM project_memberships WHERE user_id = ? AND project_id = ? LIMIT 1"
  )
    .bind(userId, projectId)
    .first<{ role: string }>();
  return row?.role ?? null;
}

async function requireMembership(env: AppEnv["Bindings"], userId: string, projectId: string): Promise<boolean> {
  return Boolean(await getMembershipRole(env, userId, projectId));
}

async function requireOwner(env: AppEnv["Bindings"], userId: string, projectId: string): Promise<boolean> {
  return (await getMembershipRole(env, userId, projectId)) === "owner";
}

function parseWindowMs(input: string | undefined): number {
  switch (input) {
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
    case "7d":
    default:
      return DEFAULT_WINDOW_MS;
  }
}

function percent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((count / total) * 100).toFixed(2));
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[idx];
}

function createProjectSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base || "project"}-${crypto.randomUUID().slice(0, 6)}`;
}

function normalizeEndpointPath(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeForwardUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function upsertManagedEndpointDestination(
  env: AppEnv["Bindings"],
  endpoint: { id: string; projectId: string; name: string; path: string; active: number },
  forwardUrl: string | null
): Promise<void> {
  if (!forwardUrl) {
    await env.DB.prepare("DELETE FROM destinations WHERE id = ? AND managed_by_endpoint = 1")
      .bind(endpoint.id)
      .run();
    return;
  }
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO destinations
     (id, project_id, name, url, endpoint_path, managed_by_endpoint, headers_json, condition_expr, transform_code, active, timeout_ms, max_retries, created_at)
     VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, NULL, ?, 5000, 3, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       url = excluded.url,
       endpoint_path = excluded.endpoint_path,
       active = excluded.active`
  )
    .bind(endpoint.id, endpoint.projectId, `${endpoint.name} forward`, forwardUrl, endpoint.path, endpoint.active, now)
    .run();
}

async function upsertManagedPrimaryDestination(
  env: AppEnv["Bindings"],
  project: { id: string; slug: string; name: string },
  forwardUrl: string | null
): Promise<void> {
  const managedId = `primary:${project.id}`;
  if (!forwardUrl) {
    await env.DB.prepare("DELETE FROM destinations WHERE id = ? AND managed_by_endpoint = 1")
      .bind(managedId)
      .run();
    return;
  }
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO destinations
     (id, project_id, name, url, endpoint_path, managed_by_endpoint, headers_json, condition_expr, transform_code, active, timeout_ms, max_retries, created_at)
     VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, NULL, 1, 5000, 3, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       url = excluded.url,
       endpoint_path = excluded.endpoint_path,
       active = excluded.active`
  )
    .bind(managedId, project.id, `${project.name} primary forward`, forwardUrl, project.slug, now)
    .run();
}

async function readCliSessionUserId(c: { req: { header(name: string): string | undefined }; env: AppEnv["Bindings"] }): Promise<string | null> {
  const token = c.req.header("x-cli-session-token");
  if (!token) return null;
  const payload = await verifyCliSessionToken(c.env.TUNNEL_TOKEN_SECRET, token);
  return payload?.userId ?? null;
}

function isManualReplayEvent(event: { replay_of_event_id?: string | null; idempotency_key?: string | null }): boolean {
  if (!event.replay_of_event_id) return false;
  return (event.idempotency_key ?? "").includes(":replay:");
}

function parseEventCursor(input: string | undefined): { receivedAt: number; id: string } | null {
  if (!input) return null;
  const [tsRaw, idRaw] = input.split(":");
  const receivedAt = Number(tsRaw);
  const id = (idRaw ?? "").trim();
  if (!Number.isFinite(receivedAt) || receivedAt <= 0 || !id) return null;
  return { receivedAt, id };
}

async function issueProjectApiKey(
  env: AppEnv["Bindings"],
  projectId: string,
  userId: string,
  label: string
): Promise<{ id: string; token: string }> {
  const token = `phk_${randomToken(28)}`;
  const tokenHash = await hashApiToken(token);
  const keyId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO api_keys (id, project_id, token, token_hash, label, revoked_at, created_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
  )
    .bind(keyId, projectId, tokenHash, tokenHash, label, userId, Date.now())
    .run();
  return { id: keyId, token };
}

apiRouter.get("/api/me", async (c) => {
  return c.json({
    user: {
      id: c.get("userId"),
      email: c.get("userEmail"),
      name: c.get("userName"),
      picture: c.get("userPicture")
    }
  });
});

apiRouter.post("/api/logout", async (c) => {
  const cookies = parseCookieHeader(c.req.header("cookie") ?? null);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (sessionId) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  }
  c.header(
    "Set-Cookie",
    setCookie(SESSION_COOKIE_NAME, "", {
      Path: "/",
      HttpOnly: true,
      Secure: true,
      SameSite: "None",
      "Max-Age": 0
    })
  );
  return c.json({ ok: true });
});

apiRouter.get("/api/projects", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.slug, p.name, p.signing_secret, p.plan_tier, p.retention_days, p.primary_forward_url
     FROM projects p
     INNER JOIN project_memberships pm ON pm.project_id = p.id
     WHERE pm.user_id = ?
       AND p.archived_at IS NULL
     ORDER BY p.created_at ASC`
  )
    .bind(c.get("userId"))
    .all<Record<string, unknown>>();
  return c.json({ projects: rows.results ?? [] });
});

apiRouter.post("/api/projects", async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New Project";
  const primaryForwardUrl = normalizeForwardUrl(body.primary_forward_url);
  if (typeof body.primary_forward_url === "string" && body.primary_forward_url.trim() && !primaryForwardUrl) {
    return c.text("Invalid primary forward URL", 400);
  }
  const slug = createProjectSlug(name);
  const projectId = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO projects (id, slug, name, signing_secret, retention_days, plan_tier, shard_id, primary_forward_url, created_at, updated_at, archived_at) VALUES (?, ?, ?, NULL, 7, 'dev', NULL, ?, ?, ?, NULL)"
  )
    .bind(projectId, slug, name, primaryForwardUrl, now, now)
    .run();
  await c.env.DB.prepare(
    "INSERT INTO project_memberships (user_id, project_id, role, created_at) VALUES (?, ?, 'owner', ?)"
  )
    .bind(c.get("userId"), projectId, now)
    .run();
  await upsertManagedPrimaryDestination(c.env, { id: projectId, slug, name }, primaryForwardUrl);
  return c.json({ project: { id: projectId, slug, name, primary_forward_url: primaryForwardUrl } });
});

apiRouter.patch("/api/projects/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireOwner(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const existing = await c.env.DB.prepare(
    "SELECT id, slug, name, retention_days, plan_tier, signing_secret, primary_forward_url FROM projects WHERE id = ? AND archived_at IS NULL LIMIT 1"
  )
    .bind(projectId)
    .first<{ id: string; slug: string; name: string; retention_days: number; plan_tier: string; signing_secret: string | null; primary_forward_url: string | null }>();
  if (!existing) return c.text("Project not found", 404);

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name;
  const retentionDays =
    typeof body.retention_days === "number" && body.retention_days >= 1 ? Math.floor(body.retention_days) : existing.retention_days;
  const planTier = typeof body.plan_tier === "string" && body.plan_tier ? body.plan_tier : existing.plan_tier;
  const signingSecret = typeof body.signing_secret === "string" ? body.signing_secret : existing.signing_secret;
  const primaryForwardUrl =
    body.primary_forward_url === undefined
      ? existing.primary_forward_url
      : normalizeForwardUrl(body.primary_forward_url);
  if (body.primary_forward_url !== undefined && typeof body.primary_forward_url === "string" && body.primary_forward_url.trim() && !primaryForwardUrl) {
    return c.text("Invalid primary forward URL", 400);
  }

  await c.env.DB.prepare(
    "UPDATE projects SET name = ?, retention_days = ?, plan_tier = ?, signing_secret = ?, primary_forward_url = ?, updated_at = ? WHERE id = ?"
  )
    .bind(name, retentionDays, planTier, signingSecret, primaryForwardUrl, Date.now(), projectId)
    .run();
  await upsertManagedPrimaryDestination(c.env, { id: projectId, slug: existing.slug, name }, primaryForwardUrl);
  return c.json({ ok: true });
});

apiRouter.delete("/api/projects/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireOwner(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  const now = Date.now();
  await c.env.DB.prepare("UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, projectId)
    .run();
  await c.env.DB.prepare("DELETE FROM destinations WHERE id = ? AND managed_by_endpoint = 1")
    .bind(`primary:${projectId}`)
    .run();
  return c.json({ ok: true });
});

apiRouter.get("/api/projects/:projectId/endpoints", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  const rows = await c.env.DB.prepare(
    `SELECT id, project_id, name, path, forward_url, active, created_at, updated_at
     FROM project_endpoints
     WHERE project_id = ?
     ORDER BY created_at ASC`
  )
    .bind(projectId)
    .all<ProjectEndpointRow>();
  return c.json({ endpoints: rows.results ?? [] });
});

apiRouter.post("/api/projects/:projectId/endpoints", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireOwner(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Endpoint";
  const rawPath = typeof body.path === "string" ? body.path : "";
  const path = normalizeEndpointPath(rawPath);
  if (!path) return c.text("Invalid endpoint path", 400);
  const forwardUrl = normalizeForwardUrl(body.forward_url);
  if (typeof body.forward_url === "string" && body.forward_url.trim() && !forwardUrl) {
    return c.text("Invalid forward URL", 400);
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await c.env.DB.prepare(
      `INSERT INTO project_endpoints (id, project_id, name, path, forward_url, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    )
      .bind(id, projectId, name, path, forwardUrl, now, now)
      .run();
  } catch {
    return c.text("Endpoint path already exists", 409);
  }
  await upsertManagedEndpointDestination(c.env, { id, projectId, name, path, active: 1 }, forwardUrl);
  return c.json({ endpoint: { id, project_id: projectId, name, path, forward_url: forwardUrl, active: 1, created_at: now, updated_at: now } });
});

apiRouter.patch("/api/projects/:projectId/endpoints/:endpointId", async (c) => {
  const projectId = c.req.param("projectId");
  const endpointId = c.req.param("endpointId");
  if (!(await requireOwner(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  const existing = await c.env.DB.prepare(
    `SELECT id, project_id, name, path, forward_url, active
     FROM project_endpoints
     WHERE id = ? AND project_id = ?
     LIMIT 1`
  )
    .bind(endpointId, projectId)
    .first<{ id: string; project_id: string; name: string; path: string; forward_url: string | null; active: number }>();
  if (!existing) return c.text("Endpoint not found", 404);

  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const nextName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name;
  const nextPath = typeof body.path === "string" && body.path.trim() ? normalizeEndpointPath(body.path) : existing.path;
  const nextActive = typeof body.active === "boolean" ? (body.active ? 1 : 0) : existing.active;
  const nextForwardUrl =
    body.forward_url === undefined
      ? existing.forward_url
      : normalizeForwardUrl(body.forward_url);
  if (body.forward_url !== undefined && typeof body.forward_url === "string" && body.forward_url.trim() && !nextForwardUrl) {
    return c.text("Invalid forward URL", 400);
  }
  if (!nextPath) return c.text("Invalid endpoint path", 400);

  try {
    await c.env.DB.prepare(
      `UPDATE project_endpoints
       SET name = ?, path = ?, forward_url = ?, active = ?, updated_at = ?
       WHERE id = ? AND project_id = ?`
    )
      .bind(nextName, nextPath, nextForwardUrl, nextActive, Date.now(), endpointId, projectId)
      .run();
  } catch {
    return c.text("Endpoint path already exists", 409);
  }
  await upsertManagedEndpointDestination(
    c.env,
    { id: endpointId, projectId, name: nextName, path: nextPath, active: nextActive },
    nextForwardUrl
  );
  return c.json({ ok: true });
});

apiRouter.delete("/api/projects/:projectId/endpoints/:endpointId", async (c) => {
  const projectId = c.req.param("projectId");
  const endpointId = c.req.param("endpointId");
  if (!(await requireOwner(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  await c.env.DB.prepare("DELETE FROM project_endpoints WHERE id = ? AND project_id = ?")
    .bind(endpointId, projectId)
    .run();
  await c.env.DB.prepare("DELETE FROM destinations WHERE id = ? AND managed_by_endpoint = 1")
    .bind(endpointId)
    .run();
  return c.json({ ok: true });
});

apiRouter.get("/api/projects/:projectId/events", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  const requestedLimit = Number(c.req.query("limit") ?? "100");
  const limit = Math.min(200, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 100));
  const before = parseEventCursor(c.req.query("before"));
  const repos = new D1Repositories(c.env);
  const events = await repos.events.listByProject(projectId, limit, before ?? undefined);
  const normalizedEvents = events.map((event) => ({
    ...event,
    replay: isManualReplayEvent({
      replay_of_event_id: typeof event.replay_of_event_id === "string" ? event.replay_of_event_id : null,
      idempotency_key: typeof event.idempotency_key === "string" ? event.idempotency_key : null
    })
  }));
  const last = events[events.length - 1] as { received_at?: number; id?: string } | undefined;
  const nextCursor =
    events.length === limit && last?.received_at && last?.id
      ? `${Number(last.received_at)}:${String(last.id)}`
      : null;
  return c.json({
    events: normalizedEvents,
    pageInfo: {
      nextCursor,
      hasMore: nextCursor !== null
    }
  });
});

apiRouter.get("/api/projects/:projectId/events/:eventId/attempts", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  const repos = new D1Repositories(c.env);
  const attempts = await repos.attempts.listForEvent(projectId, c.req.param("eventId"));
  return c.json({ attempts });
});

apiRouter.get("/api/projects/:projectId/events/:eventId/tunnels", async (c) => {
  const projectId = c.req.param("projectId");
  const eventId = c.req.param("eventId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  await ensureTunnelAttemptsTable(c.env.DB);
  const rows = await c.env.DB.prepare(
    `SELECT
       tunnel_id,
       target_url,
       device_label,
       source_ip,
       country,
       os,
       platform,
       success,
       status_code,
       error_message,
       duration_ms,
       attempted_at
     FROM tunnel_attempts
     WHERE project_id = ? AND event_id = ?
     ORDER BY attempted_at DESC`
  )
    .bind(projectId, eventId)
    .all<Record<string, unknown>>();
  return c.json({ tunnels: rows.results ?? [] });
});

apiRouter.get("/api/projects/:projectId/events/:eventId/payload", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  const repos = new D1Repositories(c.env);
  const event = await repos.events.findById(c.req.param("eventId"));
  if (!event || event.project_id !== projectId) {
    return c.text("Event not found", 404);
  }
  const payload = await getEventPayload(c.env, event.r2_key);
  let queryParams: Record<string, string | string[]> = {};
  if (event.request_query_json) {
    try {
      queryParams = JSON.parse(event.request_query_json) as Record<string, string | string[]>;
    } catch {
      queryParams = {};
    }
  }
  return c.json({
    eventId: event.id,
    payload,
    method: event.request_method ?? "POST",
    queryParams,
    endpointPath: event.endpoint_path ?? event.project_slug,
    replay: isManualReplayEvent(event)
  });
});

apiRouter.post("/api/projects/:projectId/events/:eventId/replay", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  const repos = new D1Repositories(c.env);
  const event = await repos.events.findById(c.req.param("eventId"));
  if (!event || event.project_id !== projectId) {
    return c.text("Event not found", 404);
  }
  const replayEventId = crypto.randomUUID();
  const now = Date.now();
  await repos.events.insertOrIgnore({
    id: replayEventId,
    projectId: event.project_id,
    projectSlug: event.project_slug,
    endpointPath: event.endpoint_path ?? event.project_slug,
    r2Key: event.r2_key,
    idempotencyKey: `${event.id}:replay:${now}`,
    requestMethod: event.request_method ?? "POST",
    requestQueryJson: event.request_query_json ?? null,
    requestHeadersJson: "{}",
    sourceIp: null,
    replayOfEventId: event.id,
    receivedAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000
  });
  await repos.replays.insert(event.id, event.project_id);
  const queuePayload: EnqueuedWebhookEvent = {
    eventId: replayEventId,
    projectId: event.project_id,
    projectSlug: event.project_slug,
    endpointPath: event.endpoint_path ?? event.project_slug,
    r2Key: event.r2_key,
    headers: {},
    sourceIp: null,
    replay: true,
    receivedAt: now
  };
  await c.env.WEBHOOK_QUEUE.send(queuePayload);
  // Replays should hit active local tunnels too.
  const replayPayload = await getEventPayload(c.env, event.r2_key);
  await dispatchToTunnel(c.env, event.project_slug, event.endpoint_path ?? event.project_slug, replayEventId, replayPayload, {});
  return c.json({ replayed: true, replayEventId });
});

apiRouter.post("/api/projects/:projectId/tunnel-token", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  const project = await c.env.DB.prepare("SELECT id, slug FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ id: string; slug: string }>();
  if (!project) return c.text("Project not found", 404);

  const exp = Math.floor(Date.now() / 1000) + 10 * 60;
  const token = await signTunnelToken(c.env.TUNNEL_TOKEN_SECRET, {
    projectId: project.id,
    projectSlug: project.slug,
    exp
  });
  return c.json({ token, expiresAt: exp * 1000 });
});

apiRouter.post("/api/cli/device/start", async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000;
  const deviceCode = randomToken(24);
  const userCode = randomUserCode();
  const requestedProjectSlug = typeof body.projectSlug === "string" && body.projectSlug.trim() ? body.projectSlug.trim() : null;
  await c.env.DB.prepare(
    `INSERT INTO cli_device_flows
     (device_code, user_code, requested_project_slug, selected_project_id, selected_project_slug, status, approved_by_user_id, created_at, expires_at, approved_at, consumed_at, last_polled_at)
     VALUES (?, ?, ?, NULL, NULL, 'pending', NULL, ?, ?, NULL, NULL, NULL)`
  )
    .bind(deviceCode, userCode, requestedProjectSlug, now, expiresAt)
    .run();

  const origin = new URL(c.req.url).origin;
  return c.json({
    deviceCode,
    userCode,
    verificationUri: `${origin}/cli/verify?user_code=${encodeURIComponent(userCode)}`,
    intervalSeconds: 3,
    expiresAt
  });
});

apiRouter.post("/api/cli/device/poll", async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const deviceCode = typeof body.deviceCode === "string" ? body.deviceCode : "";
  if (!deviceCode) return c.text("Missing deviceCode", 400);

  const now = Date.now();
  const row = await c.env.DB.prepare(
    `SELECT device_code, selected_project_id, selected_project_slug, approved_by_user_id, status, expires_at
     FROM cli_device_flows
     WHERE device_code = ?
     LIMIT 1`
  )
    .bind(deviceCode)
    .first<{
      device_code: string;
      selected_project_id: string | null;
      selected_project_slug: string | null;
      approved_by_user_id: string | null;
      status: string;
      expires_at: number;
    }>();
  if (!row) return c.text("Invalid device code", 404);
  if (now > Number(row.expires_at)) {
    await c.env.DB.prepare("UPDATE cli_device_flows SET status = 'expired' WHERE device_code = ?").bind(deviceCode).run();
    return c.json({ status: "expired" }, 400);
  }
  await c.env.DB.prepare("UPDATE cli_device_flows SET last_polled_at = ? WHERE device_code = ?").bind(now, deviceCode).run();

  if (row.status === "pending") return c.json({ status: "pending" }, 202);
  if (row.status !== "approved") return c.json({ status: row.status }, 400);
  if (!row.approved_by_user_id) return c.json({ status: "pending" }, 202);
  await c.env.DB.prepare("UPDATE cli_device_flows SET status = 'consumed', consumed_at = ? WHERE device_code = ?")
    .bind(Date.now(), deviceCode)
    .run();
  const cliSessionExp = Math.floor(Date.now() / 1000) + CLI_SESSION_TTL_SECONDS;
  const cliSessionToken = await signCliSessionToken(c.env.TUNNEL_TOKEN_SECRET, {
    userId: row.approved_by_user_id,
    exp: cliSessionExp
  });
  return c.json({
    status: "approved",
    projectSlug: row.selected_project_slug,
    cliSessionToken,
    cliSessionExpiresAt: cliSessionExp * 1000
  });
});

apiRouter.post("/api/cli/device/select", async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const deviceCode = typeof body.deviceCode === "string" ? body.deviceCode : "";
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  if (!deviceCode || !projectId) return c.text("Missing deviceCode or projectId", 400);

  const flow = await c.env.DB.prepare(
    `SELECT approved_by_user_id, status, expires_at
     FROM cli_device_flows
     WHERE device_code = ?
     LIMIT 1`
  )
    .bind(deviceCode)
    .first<{ approved_by_user_id: string | null; status: string; expires_at: number }>();
  if (!flow) return c.text("Invalid device code", 404);
  if (Date.now() > Number(flow.expires_at)) return c.text("Device flow expired", 400);
  if (flow.status !== "needs_project") return c.text("Flow not awaiting project selection", 400);
  if (!flow.approved_by_user_id) return c.text("Flow not linked to a user", 400);

  const membershipProject = await c.env.DB.prepare(
    `SELECT p.id, p.slug
     FROM projects p
     INNER JOIN project_memberships pm ON pm.project_id = p.id
     WHERE p.id = ? AND pm.user_id = ? AND p.archived_at IS NULL
     LIMIT 1`
  )
    .bind(projectId, flow.approved_by_user_id)
    .first<{ id: string; slug: string }>();
  if (!membershipProject) return c.text("Project not allowed", 403);

  await c.env.DB.prepare(
    `UPDATE cli_device_flows
     SET selected_project_id = ?, selected_project_slug = ?, status = 'approved', approved_at = ?
     WHERE device_code = ?`
  )
    .bind(membershipProject.id, membershipProject.slug, Date.now(), deviceCode)
    .run();
  return c.json({ ok: true, projectSlug: membershipProject.slug });
});

apiRouter.post("/api/cli/session/projects", async (c) => {
  const userId = await readCliSessionUserId(c);
  if (!userId) return c.text("Unauthorized", 401);
  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.slug, p.name
     FROM projects p
     INNER JOIN project_memberships pm ON pm.project_id = p.id
     WHERE pm.user_id = ? AND p.archived_at IS NULL
     ORDER BY p.created_at ASC`
  )
    .bind(userId)
    .all<{ id: string; slug: string; name: string }>();
  return c.json({ projects: rows.results ?? [] });
});

apiRouter.post("/api/cli/session/endpoints", async (c) => {
  const userId = await readCliSessionUserId(c);
  if (!userId) return c.text("Unauthorized", 401);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const projectSlug = typeof body.projectSlug === "string" ? body.projectSlug.trim() : "";
  if (!projectSlug) return c.text("Missing projectSlug", 400);
  const project = await c.env.DB.prepare(
    `SELECT p.id, p.slug
     FROM projects p
     INNER JOIN project_memberships pm ON pm.project_id = p.id
     WHERE p.slug = ? AND pm.user_id = ? AND p.archived_at IS NULL
     LIMIT 1`
  )
    .bind(projectSlug, userId)
    .first<{ id: string; slug: string }>();
  if (!project) return c.text("Project not allowed", 403);
  const endpoints = await c.env.DB.prepare(
    `SELECT id, name, path, active
     FROM project_endpoints
     WHERE project_id = ?
     ORDER BY created_at ASC`
  )
    .bind(project.id)
    .all<{ id: string; name: string; path: string; active: number }>();
  return c.json({
    projectId: project.id,
    projectSlug: project.slug,
    primaryPath: project.slug,
    endpoints: endpoints.results ?? []
  });
});

apiRouter.post("/api/cli/session/endpoints/temp", async (c) => {
  const userId = await readCliSessionUserId(c);
  if (!userId) return c.text("Unauthorized", 401);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const projectSlug = typeof body.projectSlug === "string" ? body.projectSlug.trim() : "";
  if (!projectSlug) return c.text("Missing projectSlug", 400);
  const project = await c.env.DB.prepare(
    `SELECT p.id, p.slug
     FROM projects p
     INNER JOIN project_memberships pm ON pm.project_id = p.id
     WHERE p.slug = ? AND pm.user_id = ? AND p.archived_at IS NULL
     LIMIT 1`
  )
    .bind(projectSlug, userId)
    .first<{ id: string; slug: string }>();
  if (!project) return c.text("Project not allowed", 403);

  const basePath = `${project.slug}-tmp`;
  const now = Date.now();
  for (let i = 0; i < 5; i += 1) {
    const suffix = randomToken(4).toLowerCase();
    const path = normalizeEndpointPath(`${basePath}-${suffix}`);
    if (!path) continue;
    try {
      const endpointId = crypto.randomUUID();
      await c.env.DB.prepare(
        `INSERT INTO project_endpoints (id, project_id, name, path, forward_url, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, 1, ?, ?)`
      )
        .bind(endpointId, project.id, "Temp tunnel endpoint", path, now, now)
        .run();
      return c.json({ endpoint: { id: endpointId, path, name: "Temp tunnel endpoint" } });
    } catch {
      // Retry on path collision.
    }
  }
  return c.text("Could not create temporary endpoint", 500);
});

apiRouter.post("/api/cli/session/tunnel-token", async (c) => {
  const userId = await readCliSessionUserId(c);
  if (!userId) return c.text("Unauthorized", 401);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const projectSlug = typeof body.projectSlug === "string" ? body.projectSlug.trim() : "";
  if (!projectSlug) return c.text("Missing projectSlug", 400);
  const project = await c.env.DB.prepare(
    `SELECT p.id, p.slug
     FROM projects p
     INNER JOIN project_memberships pm ON pm.project_id = p.id
     WHERE p.slug = ? AND pm.user_id = ? AND p.archived_at IS NULL
     LIMIT 1`
  )
    .bind(projectSlug, userId)
    .first<{ id: string; slug: string }>();
  if (!project) return c.text("Project not allowed", 403);
  const exp = Math.floor(Date.now() / 1000) + 10 * 60;
  const token = await signTunnelToken(c.env.TUNNEL_TOKEN_SECRET, {
    projectId: project.id,
    projectSlug: project.slug,
    exp
  });
  return c.json({ token, expiresAt: exp * 1000, projectSlug: project.slug });
});

apiRouter.get("/api/projects/:projectId/api-keys", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  const rows = await c.env.DB.prepare(
    `SELECT id, label, created_at, revoked_at, substr(token_hash, 1, 10) as fingerprint
     FROM api_keys
     WHERE project_id = ?
     ORDER BY created_at DESC`
  )
    .bind(projectId)
    .all<Record<string, unknown>>();
  return c.json({ apiKeys: rows.results ?? [] });
});

apiRouter.post("/api/projects/:projectId/api-keys", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : "Default";
  const created = await issueProjectApiKey(c.env, projectId, c.get("userId"), label);
  return c.json({ apiKey: created });
});

apiRouter.post("/api/projects/:projectId/api-keys/:keyId/rotate", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  const keyId = c.req.param("keyId");
  const row = await c.env.DB.prepare(
    "SELECT id, label, revoked_at FROM api_keys WHERE id = ? AND project_id = ? LIMIT 1"
  )
    .bind(keyId, projectId)
    .first<{ id: string; label: string | null; revoked_at: number | null }>();
  if (!row) return c.text("Key not found", 404);
  await c.env.DB.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
  const created = await issueProjectApiKey(c.env, projectId, c.get("userId"), row.label ?? "Rotated");
  return c.json({ apiKey: created });
});

apiRouter.delete("/api/projects/:projectId/api-keys/:keyId", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) {
    return c.text("Forbidden", 403);
  }
  await c.env.DB.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND project_id = ?")
    .bind(Date.now(), c.req.param("keyId"), projectId)
    .run();
  return c.json({ ok: true });
});

apiRouter.get("/api/metrics/projects-volume", async (c) => {
  const windowMs = parseWindowMs(c.req.query("window"));
  const since = Date.now() - windowMs;
  const rows = await c.env.DB.prepare(
    `SELECT p.id as project_id, p.slug as project_slug, p.name as project_name, COUNT(e.id) as count
     FROM projects p
     INNER JOIN project_memberships pm ON pm.project_id = p.id
     LEFT JOIN events e ON e.project_id = p.id AND e.received_at >= ?
     WHERE pm.user_id = ? AND p.archived_at IS NULL
     GROUP BY p.id, p.slug, p.name
     ORDER BY count DESC, p.created_at ASC`
  )
    .bind(since, c.get("userId"))
    .all<Record<string, unknown>>();
  return c.json({ metrics: rows.results ?? [] });
});

apiRouter.get("/api/metrics/project/:projectId/timeseries", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) return c.text("Forbidden", 403);
  const windowMs = parseWindowMs(c.req.query("window"));
  const bucket = c.req.query("bucket") === "day" ? "day" : "hour";
  const since = Date.now() - windowMs;
  const rows = await c.env.DB.prepare(
    `SELECT
       CASE WHEN ? = 'day'
         THEN (received_at / 86400000) * 86400000
         ELSE (received_at / 3600000) * 3600000
       END AS bucket_start,
       COUNT(*) AS count
     FROM events
     WHERE project_id = ? AND received_at >= ?
     GROUP BY bucket_start
     ORDER BY bucket_start ASC`
  )
    .bind(bucket, projectId, since)
    .all<Record<string, unknown>>();
  return c.json({ points: rows.results ?? [] });
});

apiRouter.get("/api/metrics/project/:projectId/status-codes", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) return c.text("Forbidden", 403);
  const since = Date.now() - parseWindowMs(c.req.query("window"));
  const rows = await c.env.DB.prepare(
    `SELECT a.status_code, a.success, a.error_message
     FROM delivery_attempts a
     INNER JOIN events e ON e.id = a.event_id
     WHERE e.project_id = ? AND a.attempted_at >= ?`
  )
    .bind(projectId, since)
    .all<{ status_code: number | null; success: number; error_message: string | null }>();
  const records = rows.results ?? [];
  const total = records.length;
  const grouped = {
    http_2xx: 0,
    http_4xx: 0,
    http_5xx: 0,
    timeout_or_network: 0
  };
  for (const row of records) {
    if (row.status_code === null) grouped.timeout_or_network += 1;
    else if (row.status_code >= 500) grouped.http_5xx += 1;
    else if (row.status_code >= 400) grouped.http_4xx += 1;
    else grouped.http_2xx += 1;
  }
  const metrics = Object.entries(grouped).map(([bucketName, count]) => ({
    bucket: bucketName,
    count,
    percentage: percent(count, total)
  }));
  return c.json({ metrics, total });
});

apiRouter.get("/api/metrics/project/:projectId/status-codes-detailed", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) return c.text("Forbidden", 403);
  const since = Date.now() - parseWindowMs(c.req.query("window"));
  const rows = await c.env.DB.prepare(
    `SELECT CASE WHEN a.status_code IS NULL THEN 'timeout_or_network' ELSE CAST(a.status_code AS TEXT) END as code,
            COUNT(*) as count
     FROM delivery_attempts a
     INNER JOIN events e ON e.id = a.event_id
     WHERE e.project_id = ? AND a.attempted_at >= ?
     GROUP BY code
     ORDER BY count DESC`
  )
    .bind(projectId, since)
    .all<{ code: string; count: number }>();
  const list = rows.results ?? [];
  const total = list.reduce((sum, row) => sum + Number(row.count), 0);
  const metrics = list.map((row) => ({
    code: String(row.code),
    count: Number(row.count),
    percentage: percent(Number(row.count), total)
  }));
  return c.json({ metrics, total });
});

apiRouter.get("/api/metrics/project/:projectId/latency", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) return c.text("Forbidden", 403);
  const since = Date.now() - parseWindowMs(c.req.query("window"));
  const rows = await c.env.DB.prepare(
    `SELECT a.duration_ms
     FROM delivery_attempts a
     INNER JOIN events e ON e.id = a.event_id
     WHERE e.project_id = ? AND a.attempted_at >= ? AND a.duration_ms IS NOT NULL`
  )
    .bind(projectId, since)
    .all<{ duration_ms: number }>();
  const values = (rows.results ?? []).map((r) => Number(r.duration_ms)).filter((v) => Number.isFinite(v));
  const total = values.length;
  const avg = total ? Math.round(values.reduce((s, v) => s + v, 0) / total) : 0;
  const max = total ? Math.max(...values) : 0;
  return c.json({
    latency: {
      p50: percentile(values, 0.5),
      p95: percentile(values, 0.95),
      p99: percentile(values, 0.99),
      avg,
      max
    },
    totalSamples: total
  });
});

apiRouter.get("/api/metrics/project/:projectId/delivery-health", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) return c.text("Forbidden", 403);
  const since = Date.now() - parseWindowMs(c.req.query("window"));
  const row = await c.env.DB.prepare(
    `SELECT
      SUM(CASE WHEN a.success = 1 THEN 1 ELSE 0 END) AS success_count,
      SUM(CASE WHEN a.success = 0 THEN 1 ELSE 0 END) AS failed_count
     FROM delivery_attempts a
     INNER JOIN events e ON e.id = a.event_id
     WHERE e.project_id = ? AND a.attempted_at >= ?`
  )
    .bind(projectId, since)
    .first<{ success_count: number | null; failed_count: number | null }>();
  const successCount = Number(row?.success_count ?? 0);
  const failedCount = Number(row?.failed_count ?? 0);
  const total = successCount + failedCount;
  return c.json({
    health: {
      successCount,
      failedCount,
      successRate: percent(successCount, total)
    }
  });
});

apiRouter.get("/api/metrics/project/:projectId/ops", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await requireMembership(c.env, c.get("userId"), projectId))) return c.text("Forbidden", 403);
  const windowMs = parseWindowMs(c.req.query("window"));
  const sinceMinute = Math.floor((Date.now() - windowMs) / 60_000);

  const usageRows = await c.env.DB.prepare(
    `SELECT month_key, events_count
     FROM usage_counters
     WHERE project_id = ?
       AND (
         month_key LIKE 'rl:project:%'
         OR month_key LIKE 'rl_exceeded:%'
         OR month_key LIKE 'alert:%'
       )`
  )
    .bind(projectId)
    .all<{ month_key: string; events_count: number }>();

  let ingressCount = 0;
  let rateLimitedProject = 0;
  let rateLimitedIp = 0;
  const alerts: Record<string, number> = {};
  const rateLimitedSeriesMap = new Map<number, number>();
  for (const row of usageRows.results ?? []) {
    const key = String(row.month_key);
    const count = Number(row.events_count ?? 0);
    if (key.startsWith("rl:project:")) {
      const minute = Number.parseInt(key.slice("rl:project:".length), 10);
      if (Number.isFinite(minute) && minute >= sinceMinute) ingressCount += count;
    } else if (key.startsWith("rl_exceeded:project:")) {
      const minute = Number.parseInt(key.slice("rl_exceeded:project:".length), 10);
      if (Number.isFinite(minute) && minute >= sinceMinute) {
        rateLimitedProject += count;
        rateLimitedSeriesMap.set(minute, (rateLimitedSeriesMap.get(minute) ?? 0) + count);
      }
    } else if (key.startsWith("rl_exceeded:ip:")) {
      const minute = Number.parseInt(key.slice("rl_exceeded:ip:".length), 10);
      if (Number.isFinite(minute) && minute >= sinceMinute) {
        rateLimitedIp += count;
        rateLimitedSeriesMap.set(minute, (rateLimitedSeriesMap.get(minute) ?? 0) + count);
      }
    } else if (key.startsWith("alert:")) {
      const parts = key.split(":");
      const alertType = parts[1] ?? "unknown";
      alerts[alertType] = (alerts[alertType] ?? 0) + count;
    }
  }

  const failRows = await c.env.DB.prepare(
    `SELECT
       d.id as destination_id,
       d.name as destination_name,
       SUM(CASE WHEN a.success = 0 THEN 1 ELSE 0 END) AS failed_count,
       COUNT(*) AS total_count
     FROM delivery_attempts a
     INNER JOIN events e ON e.id = a.event_id
     INNER JOIN destinations d ON d.id = a.destination_id
     WHERE e.project_id = ? AND a.attempted_at >= ?
     GROUP BY d.id, d.name
     HAVING failed_count > 0
     ORDER BY failed_count DESC, total_count DESC
     LIMIT 8`
  )
    .bind(projectId, Date.now() - windowMs)
    .all<{ destination_id: string; destination_name: string; failed_count: number; total_count: number }>();

  const topFailingDestinations = (failRows.results ?? []).map((row) => {
    const failed = Number(row.failed_count ?? 0);
    const total = Number(row.total_count ?? 0);
    return {
      destinationId: row.destination_id,
      destinationName: row.destination_name,
      failedCount: failed,
      totalCount: total,
      failureRate: percent(failed, total)
    };
  });

  const rateLimitedSeries = [...rateLimitedSeriesMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([minute, count]) => ({
      bucket_start: minute * 60_000,
      count
    }));

  return c.json({
    summary: {
      ingressCount,
      rateLimitedCount: rateLimitedProject + rateLimitedIp,
      rateLimitedProject,
      rateLimitedIp
    },
    alerts,
    rateLimitedSeries,
    topFailingDestinations
  });
});

// Machine-to-machine compatibility endpoints (API key auth).
apiRouter.use("/api/machine/*", async (c, next) => {
  const key = c.req.header("x-api-key");
  if (!key) return c.text("Missing API key", 401);
  const keyHash = await hashApiToken(key);
  const row = await c.env.DB.prepare(
    `SELECT project_id
     FROM api_keys
     WHERE (token = ? OR token_hash = ?)
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(key, keyHash)
    .first<{ project_id: string }>();
  if (!row) return c.text("Invalid API key", 403);
  c.set("projectId", row.project_id);
  return next();
});

apiRouter.get("/api/machine/events", async (c) => {
  const requestedLimit = Number(c.req.query("limit") ?? "100");
  const limit = Math.min(200, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 100));
  const before = parseEventCursor(c.req.query("before"));
  const repos = new D1Repositories(c.env);
  const events = await repos.events.listByProject(c.get("projectId"), limit, before ?? undefined);
  const last = events[events.length - 1] as { received_at?: number; id?: string } | undefined;
  const nextCursor =
    events.length === limit && last?.received_at && last?.id
      ? `${Number(last.received_at)}:${String(last.id)}`
      : null;
  return c.json({
    events,
    pageInfo: {
      nextCursor,
      hasMore: nextCursor !== null
    }
  });
});

apiRouter.get("/api/machine/events/:eventId/attempts", async (c) => {
  const repos = new D1Repositories(c.env);
  const attempts = await repos.attempts.listForEvent(c.get("projectId"), c.req.param("eventId"));
  return c.json({ attempts });
});

apiRouter.get("/api/machine/events/:eventId/payload", async (c) => {
  const repos = new D1Repositories(c.env);
  const event = await repos.events.findById(c.req.param("eventId"));
  if (!event || event.project_id !== c.get("projectId")) return c.text("Event not found", 404);
  const payload = await getEventPayload(c.env, event.r2_key);
  let queryParams: Record<string, string | string[]> = {};
  if (event.request_query_json) {
    try {
      queryParams = JSON.parse(event.request_query_json) as Record<string, string | string[]>;
    } catch {
      queryParams = {};
    }
  }
  return c.json({
    eventId: event.id,
    payload,
    method: event.request_method ?? "POST",
    queryParams,
    endpointPath: event.endpoint_path ?? event.project_slug,
    replay: isManualReplayEvent(event)
  });
});

// ─────────────────────────────────────────────────────────────
// Tunnel Management API
// ─────────────────────────────────────────────────────────────

apiRouter.get("/api/tunnels", async (c) => {
  const requestedProjectSlug = (c.req.query("projectSlug") ?? "").trim();
  // Get user's projects to filter tunnels
  const projects = await c.env.DB.prepare(
    `SELECT p.slug FROM projects p
     INNER JOIN project_memberships pm ON pm.project_id = p.id
     WHERE pm.user_id = ? AND p.archived_at IS NULL`
  )
    .bind(c.get("userId"))
    .all<{ slug: string }>();

  const userProjectSlugs = new Set((projects.results ?? []).map((p) => p.slug));
  if (requestedProjectSlug && !userProjectSlugs.has(requestedProjectSlug)) {
    return c.text("Forbidden", 403);
  }

  // Fetch all tunnels from the hub
  const id = c.env.TUNNEL_HUB.idFromName("hub");
  const stub = c.env.TUNNEL_HUB.get(id);
  const response = await stub.fetch("https://tunnel/list");
  const data = (await response.json()) as { tunnels: Array<{ projectSlug: string; [key: string]: unknown }> };

  // Filter to only show tunnels for user's projects, optionally scoped to one project.
  const tunnels = data.tunnels.filter((t) => {
    if (!userProjectSlugs.has(t.projectSlug)) return false;
    if (requestedProjectSlug && t.projectSlug !== requestedProjectSlug) return false;
    return true;
  });

  await ensureTunnelAttemptsTable(c.env.DB);
  const recentStats = await c.env.DB.prepare(
    `SELECT
       tunnel_id,
       SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
       SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed_count
     FROM tunnel_attempts
     WHERE attempted_at >= ?
     GROUP BY tunnel_id`
  )
    .bind(Date.now() - 24 * 60 * 60 * 1000)
    .all<{ tunnel_id: string; success_count: number; failed_count: number }>();
  const statsById = new Map(
    (recentStats.results ?? []).map((row) => [
      row.tunnel_id,
      {
        success24h: Number(row.success_count ?? 0),
        failed24h: Number(row.failed_count ?? 0)
      }
    ])
  );

  const enriched = tunnels.map((tunnel) => ({
    ...tunnel,
    ...(statsById.get(String(tunnel.id)) ?? { success24h: 0, failed24h: 0 })
  }));

  return c.json({ tunnels: enriched });
});

apiRouter.post("/api/tunnels/disconnect", async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const tunnelId = typeof body.tunnelId === "string" ? body.tunnelId : null;
  const projectSlug = typeof body.projectSlug === "string" ? body.projectSlug : null;
  if (!tunnelId) return c.text("Missing tunnelId", 400);

  const projects = await c.env.DB.prepare(
    `SELECT p.slug FROM projects p
     INNER JOIN project_memberships pm ON pm.project_id = p.id
     WHERE pm.user_id = ? AND p.archived_at IS NULL`
  )
    .bind(c.get("userId"))
    .all<{ slug: string }>();
  const userProjectSlugs = new Set((projects.results ?? []).map((p) => p.slug));
  if (projectSlug && !userProjectSlugs.has(projectSlug)) return c.text("Forbidden", 403);

  const id = c.env.TUNNEL_HUB.idFromName("hub");
  const stub = c.env.TUNNEL_HUB.get(id);
  const subResponse = await stub.fetch(`https://tunnel/subscriber?id=${encodeURIComponent(tunnelId)}`);
  if (!subResponse.ok) return c.text("Tunnel not found", 404);
  const subData = (await subResponse.json()) as { subscriber: { projectSlug: string } };
  const tunnelProjectSlug = subData.subscriber?.projectSlug;
  if (!tunnelProjectSlug || !userProjectSlugs.has(tunnelProjectSlug)) return c.text("Forbidden", 403);
  if (projectSlug && tunnelProjectSlug !== projectSlug) return c.text("Forbidden", 403);

  await stub.fetch("https://tunnel/unregister", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: tunnelId })
  });

  return c.json({ ok: true });
});
