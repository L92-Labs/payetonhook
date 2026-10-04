import { Hono } from "hono";
import {
  createOAuthCookieState,
  decodeJwtPayload,
  getAllowedOrigins,
  getSessionUserFromRequest,
  normalizeRedirectTarget,
  parseCookieHeader,
  randomToken,
  readOAuthCookieState,
  setCookie
} from "../lib/auth";
import type { AppEnv } from "../types";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OAUTH_COOKIE_NAME = "ph_oauth";
const SESSION_COOKIE_NAME = "ph_session";

type GoogleTokenResponse = {
  access_token: string;
  id_token: string;
};

type UserInfo = {
  id: string;
  email: string;
  name: string;
  picture: string | null;
};

async function exchangeCodeForTokens(env: AppEnv["Bindings"], code: string): Promise<GoogleTokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.AUTH_REDIRECT_URI,
      grant_type: "authorization_code"
    }).toString()
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed (${response.status})`);
  }
  return response.json() as Promise<GoogleTokenResponse>;
}

async function getOrCreateUser(
  env: AppEnv["Bindings"],
  profile: { sub: string; email: string; name: string; picture: string | null }
): Promise<UserInfo> {
  const existing = await env.DB.prepare("SELECT id, email, name, picture_url as picture FROM users WHERE google_sub = ? LIMIT 1")
    .bind(profile.sub)
    .first<UserInfo>();
  if (existing) {
    await env.DB.prepare("UPDATE users SET email = ?, name = ?, picture_url = ? WHERE id = ?")
      .bind(profile.email, profile.name, profile.picture, existing.id)
      .run();
    return {
      id: existing.id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture
    };
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO users (id, google_sub, email, name, picture_url, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(id, profile.sub, profile.email, profile.name, profile.picture, now)
    .run();
  return {
    id,
    email: profile.email,
    name: profile.name,
    picture: profile.picture
  };
}

function slugify(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return cleaned || "project";
}

async function ensureDefaultProject(env: AppEnv["Bindings"], user: UserInfo): Promise<void> {
  const existingMembership = await env.DB.prepare(
    "SELECT project_id FROM project_memberships WHERE user_id = ? LIMIT 1"
  )
    .bind(user.id)
    .first<{ project_id: string }>();
  if (existingMembership) return;

  const baseSlug = `${slugify(user.name)}-${user.id.slice(0, 6)}`;
  const now = Date.now();
  const projectId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO projects (id, slug, name, signing_secret, retention_days, plan_tier, shard_id, created_at) VALUES (?, ?, ?, NULL, 7, 'dev', NULL, ?)"
  )
    .bind(projectId, baseSlug, `${user.name}'s Project`, now)
    .run();
  await env.DB.prepare(
    "INSERT INTO project_memberships (user_id, project_id, role, created_at) VALUES (?, ?, 'owner', ?)"
  )
    .bind(user.id, projectId, now)
    .run();
}

export const authRouter = new Hono<AppEnv>();

authRouter.get("/auth/google/start", async (c) => {
  const allowedOrigins = getAllowedOrigins(c.env);
  const requestedRedirect = c.req.query("redirectTo") ?? null;
  let redirectTo = normalizeRedirectTarget(requestedRedirect, allowedOrigins);
  if (requestedRedirect) {
    try {
      const parsed = new URL(requestedRedirect);
      const workerOrigin = new URL(c.req.url).origin;
      // Allow worker-origin redirects for internal flows (e.g. /cli/verify device login).
      if (parsed.origin === workerOrigin) {
        redirectTo = parsed.toString();
      }
    } catch {
      // Keep normalized fallback when redirectTo is malformed.
    }
  }
  const state = randomToken(16);
  const nonce = randomToken(16);
  const oauthCookie = createOAuthCookieState({ state, nonce, redirectTo });

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", c.env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", c.env.AUTH_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("prompt", "select_account");

  c.header(
    "Set-Cookie",
    setCookie(OAUTH_COOKIE_NAME, oauthCookie, {
      Path: "/",
      HttpOnly: true,
      Secure: true,
      SameSite: "Lax",
      "Max-Age": 600
    })
  );
  return c.redirect(authUrl.toString(), 302);
});

authRouter.get("/auth/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) {
    return c.text("Missing OAuth params", 400);
  }
  const cookies = parseCookieHeader(c.req.header("cookie") ?? null);
  const oauthRaw = cookies[OAUTH_COOKIE_NAME];
  const oauthState = oauthRaw ? readOAuthCookieState(oauthRaw) : null;
  if (!oauthState || oauthState.state !== state) {
    return c.text("Invalid OAuth state", 400);
  }

  const tokens = await exchangeCodeForTokens(c.env, code);
  const idPayload = decodeJwtPayload(tokens.id_token);
  if (idPayload.nonce !== oauthState.nonce) {
    return c.text("Invalid OAuth nonce", 400);
  }
  if (!idPayload.sub || !idPayload.email) {
    return c.text("Invalid Google profile", 400);
  }

  const user = await getOrCreateUser(c.env, {
    sub: String(idPayload.sub),
    email: String(idPayload.email),
    name: String(idPayload.name ?? idPayload.email),
    picture: idPayload.picture ? String(idPayload.picture) : null
  });
  await ensureDefaultProject(c.env, user);

  const sessionId = randomToken(32);
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, created_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(
      sessionId,
      user.id,
      now + SESSION_TTL_MS,
      now,
      c.req.header("cf-connecting-ip") ?? null,
      c.req.header("user-agent") ?? null
    )
    .run();

  c.res.headers.append(
    "Set-Cookie",
    setCookie(SESSION_COOKIE_NAME, sessionId, {
      Path: "/",
      HttpOnly: true,
      Secure: true,
      SameSite: "None",
      "Max-Age": Math.floor(SESSION_TTL_MS / 1000)
    })
  );
  c.res.headers.append(
    "Set-Cookie",
    setCookie(OAUTH_COOKIE_NAME, "", {
      Path: "/",
      HttpOnly: true,
      Secure: true,
      SameSite: "Lax",
      "Max-Age": 0
    })
  );

  return c.redirect(oauthState.redirectTo, 302);
});

authRouter.post("/auth/logout", async (c) => {
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

authRouter.get("/cli/verify", async (c) => {
  const userCode = (c.req.query("user_code") ?? "").trim().toUpperCase();
  if (!userCode) return c.text("Missing user_code", 400);

  const user = await getSessionUserFromRequest(c.env, c.req.raw);
  if (!user) {
    const redirectTo = new URL(c.req.url).toString();
    return c.redirect(`/auth/google/start?redirectTo=${encodeURIComponent(redirectTo)}`, 302);
  }

  const flow = await c.env.DB.prepare(
    `SELECT device_code, requested_project_slug, status, expires_at
     FROM cli_device_flows
     WHERE user_code = ?
     LIMIT 1`
  )
    .bind(userCode)
    .first<{ device_code: string; requested_project_slug: string | null; status: string; expires_at: number }>();
  if (!flow) return c.text("Unknown CLI code", 404);
  if (Date.now() > Number(flow.expires_at)) return c.text("CLI code expired", 400);
  if (flow.status !== "pending") return c.text(`CLI code already ${flow.status}`, 400);

  const projects = await c.env.DB.prepare(
    `SELECT p.id, p.slug, p.name
     FROM projects p
     INNER JOIN project_memberships pm ON pm.project_id = p.id
     WHERE pm.user_id = ? AND p.archived_at IS NULL
     ORDER BY p.created_at ASC`
  )
    .bind(user.id)
    .all<{ id: string; slug: string; name: string }>();
  const memberProjects = projects.results ?? [];
  if (memberProjects.length === 0) return c.text("You do not have access to any project", 403);

  // If CLI requested a specific project slug, try honoring it first.
  const requested = flow.requested_project_slug
    ? memberProjects.find((project) => project.slug === flow.requested_project_slug)
    : null;

  const selectedByQuery = c.req.query("project_id");
  const selected = selectedByQuery
    ? memberProjects.find((project) => project.id === selectedByQuery)
    : requested ?? (memberProjects.length === 1 ? memberProjects[0] : null);

  await c.env.DB.prepare(
    `UPDATE cli_device_flows
     SET status = 'approved', approved_by_user_id = ?, selected_project_id = ?, selected_project_slug = ?, approved_at = ?
     WHERE device_code = ?`
  )
    .bind(user.id, selected?.id ?? null, selected?.slug ?? null, Date.now(), flow.device_code)
    .run();

  return c.html(
    `<!doctype html><html><head><meta charset="utf-8"><title>CLI Linked</title></head><body style="font-family:system-ui;padding:24px;background:#0b1020;color:#fff"><h1>CLI linked successfully</h1><p>Projects can now be selected directly in CLI when running tunnel.</p><p>You can now return to your terminal.</p></body></html>`
  );
});
