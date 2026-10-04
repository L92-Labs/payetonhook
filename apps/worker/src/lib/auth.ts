import { sha256Hex } from "./crypto";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  picture_url: string | null;
};

type OAuthCookieState = {
  state: string;
  nonce: string;
  redirectTo: string;
};

function b64UrlEncode(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

export function parseCookieHeader(raw: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  const pairs = raw.split(";");
  for (const pair of pairs) {
    const [k, ...rest] = pair.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("="));
  }
  return out;
}

export function setCookie(name: string, value: string, options: Record<string, string | number | boolean>): string {
  const attrs = Object.entries(options).map(([k, v]) => (v === true ? k : `${k}=${v}`));
  return `${name}=${encodeURIComponent(value)}; ${attrs.join("; ")}`;
}

export function getAllowedOrigins(env: { DASHBOARD_ORIGINS?: string }): string[] {
  return (env.DASHBOARD_ORIGINS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.some((candidate) => {
    if (candidate === origin) return true;
    // Supports wildcard entries like "*.example.com"
    if (candidate.startsWith("*.")) {
      const suffix = candidate.slice(1); // ".example.com"
      return origin.endsWith(suffix);
    }
    return false;
  });
}

export function pickOrigin(headers: Headers, allowedOrigins: string[]): string | null {
  const origin = headers.get("origin");
  if (!origin) return null;
  return isOriginAllowed(origin, allowedOrigins) ? origin : null;
}

export function normalizeRedirectTarget(target: string | null, allowedOrigins: string[]): string {
  if (!target) return allowedOrigins[0] ?? "https://payetonhook-dashboard.pages.dev";
  try {
    const url = new URL(target);
    if (isOriginAllowed(url.origin, allowedOrigins)) {
      return url.toString();
    }
  } catch {
    // fallback handled below
  }
  return allowedOrigins[0] ?? "https://payetonhook-dashboard.pages.dev";
}

export function createOAuthCookieState(state: OAuthCookieState): string {
  return b64UrlEncode(JSON.stringify(state));
}

export function readOAuthCookieState(raw: string): OAuthCookieState | null {
  try {
    const value = JSON.parse(b64UrlDecode(raw)) as OAuthCookieState;
    if (!value.state || !value.nonce || !value.redirectTo) return null;
    return value;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 24): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashApiToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  if (!payload) {
    throw new Error("Invalid id_token");
  }
  return JSON.parse(b64UrlDecode(payload)) as Record<string, unknown>;
}

export async function getSessionUserFromRequest(
  env: { DB: D1Database },
  request: Request
): Promise<SessionUser | null> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const sessionId = cookies.ph_session;
  if (!sessionId) return null;
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.picture_url
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?
     LIMIT 1`
  )
    .bind(sessionId, now)
    .first<SessionUser>();
  return row ?? null;
}
