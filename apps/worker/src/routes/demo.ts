import { Hono, type Context } from "hono";
import { getAllowedOrigins, pickOrigin } from "../lib/auth";
import { DEMO_MAX_BODY_BYTES, isValidDemoSlot } from "../demo/logic";
import type { AppEnv } from "../types";
import { DemoRoom } from "../demo/room";

export const demoRouter = new Hono<AppEnv>();

// ─────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────

function corsHeaders(env: AppEnv["Bindings"], request: Request): Record<string, string> {
  const allowed = pickOrigin(request.headers, getAllowedOrigins(env));
  return {
    ...(allowed ? { "access-control-allow-origin": allowed, vary: "Origin" } : { vary: "Origin" }),
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600"
  };
}

function applyCors(c: Context<AppEnv>, extra?: Record<string, string>): void {
  for (const [key, value] of Object.entries({ ...corsHeaders(c.env, c.req.raw), ...extra })) {
    c.header(key, value);
  }
}

// ─────────────────────────────────────────────────────────────
// Rate limit (demo only): per-IP sliding window, module scope.
// ─────────────────────────────────────────────────────────────

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const hitsByIp = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (hitsByIp.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  hitsByIp.set(ip, hits);
  if (hitsByIp.size > 5000) {
    for (const [key, times] of hitsByIp) {
      if (times.every((t) => now - t >= RATE_WINDOW_MS)) hitsByIp.delete(key);
    }
  }
  return hits.length > RATE_LIMIT;
}

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

function getRoomStub(env: AppEnv["Bindings"], slot: string) {
  return env.DEMO_HUB.get(env.DEMO_HUB.idFromName(slot));
}

demoRouter.post("/in/demo/:slot", async (c) => {
  const slot = c.req.param("slot");
  if (!isValidDemoSlot(slot)) {
    applyCors(c);
    return c.json({ ok: false, error: "invalid_slot" }, 400);
  }
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  if (rateLimited(ip)) {
    applyCors(c, { "retry-after": "60" });
    return c.json({ ok: false, error: "rate_limited" }, 429);
  }

  const method = c.req.method.toUpperCase();
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).length > DEMO_MAX_BODY_BYTES) {
    applyCors(c);
    return c.json({ ok: false, error: "payload_too_large" }, 413);
  }

  const stub = getRoomStub(c.env, slot);
  const roomResponse = await stub.fetch("https://demo-room/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      method,
      path: new URL(c.req.url).pathname,
      body: raw,
      contentType: c.req.header("content-type") ?? ""
    })
  });
  const result = (await roomResponse.json()) as {
    ok: boolean;
    event?: { id: string; received_at: string };
    error?: string;
  };
  applyCors(c);
  return c.json(result, roomResponse.ok ? 202 : 400);
});

demoRouter.get("/demo/events/:slot", (c) => {
  const slot = c.req.param("slot");
  if (!isValidDemoSlot(slot)) {
    applyCors(c);
    return c.text("Invalid slot", 400);
  }
  const stub = getRoomStub(c.env, slot);
  return stub.fetch("https://demo-room/events", {
    headers: { accept: c.req.header("accept") ?? "text/event-stream" },
    signal: c.req.raw.signal
  });
});

demoRouter.options("/in/demo/:slot", (c) => {
  applyCors(c);
  return c.body(null, 204);
});

demoRouter.options("/demo/events/:slot", (c) => {
  applyCors(c);
  return c.body(null, 204);
});
