import { Hono } from "hono";
import type { Context } from "hono";
import type { EnqueuedWebhookEvent } from "@payetonhook/shared";
import { D1Repositories } from "../lib/db";
import { sha256Hex } from "../lib/crypto";
import { applyIngressRateLimit, sendOpsAlert } from "../lib/opsGuard";
import { putEventPayload } from "../lib/r2";
import { verifySimpleHmacSignature } from "../lib/signature";
import { dispatchToTunnel } from "./tunnel";
import type { AppEnv } from "../types";

function toHeadersObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export const incomingRouter = new Hono<AppEnv>();

function queryParamsJson(url: URL): string | null {
  if (!url.searchParams.size) return null;
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams.entries()) {
    const existing = out[key];
    if (existing === undefined) {
      out[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
      out[key] = existing;
    } else {
      out[key] = [existing, value];
    }
  }
  return JSON.stringify(out);
}

async function handleIncoming(c: Context<AppEnv>) {
  const endpointPath = c.req.param("endpointPath");
  const repos = new D1Repositories(c.env);
  let project = await repos.projects.findBySlug(endpointPath);
  if (!project) {
    const endpoint = await c.env.DB.prepare(
      `SELECT p.id, p.slug, p.name, p.signing_secret, p.retention_days, p.plan_tier, p.shard_id, p.created_at
       FROM project_endpoints pe
       INNER JOIN projects p ON p.id = pe.project_id
       WHERE pe.path = ? AND pe.active = 1 AND p.archived_at IS NULL
       LIMIT 1`
    )
      .bind(endpointPath)
      .first<{
        id: string;
        slug: string;
        name: string;
        signing_secret: string | null;
        retention_days: number;
        plan_tier: string;
        shard_id: string | null;
        created_at: number;
      }>();
    if (endpoint) {
      project = {
        id: endpoint.id,
        slug: endpoint.slug,
        name: endpoint.name,
        signingSecret: endpoint.signing_secret,
        retentionDays: Number(endpoint.retention_days),
        planTier: endpoint.plan_tier as "dev" | "free" | "pro" | "enterprise",
        shardId: endpoint.shard_id,
        createdAt: Number(endpoint.created_at)
      };
    }
  }
  if (!project) {
    return c.text("Project not found", 404);
  }
  const sourceIp = c.req.header("cf-connecting-ip") ?? null;
  const rateLimit = await applyIngressRateLimit(c.env, project.id, sourceIp);
  c.header("X-RateLimit-Limit-Project", String(rateLimit.projectLimit));
  c.header("X-RateLimit-Remaining-Project", String(Math.max(0, rateLimit.projectLimit - rateLimit.projectCount)));
  c.header("X-RateLimit-Limit-IP", String(rateLimit.ipLimit));
  c.header("X-RateLimit-Remaining-IP", String(Math.max(0, rateLimit.ipLimit - rateLimit.ipCount)));
  if (rateLimit.exceeded) {
    c.header("Retry-After", "60");
    await sendOpsAlert(c.env, {
      type: "ingress_rate_limited",
      projectId: project.id,
      projectSlug: project.slug,
      summary: `Ingress rate limit exceeded (${rateLimit.exceeded})`,
      details: {
        sourceIp,
        projectCount: rateLimit.projectCount,
        projectLimit: rateLimit.projectLimit,
        ipCount: rateLimit.ipCount,
        ipLimit: rateLimit.ipLimit
      }
    });
    return c.json(
      {
        received: false,
        error: "rate_limited",
        scope: rateLimit.exceeded
      },
      429
    );
  }

  const method = c.req.method.toUpperCase();
  const requestUrl = new URL(c.req.url);
  const queryJson = queryParamsJson(requestUrl);
  const body = method === "GET" ? "" : await c.req.text();
  if (project.signingSecret) {
    const signature = c.req.header("x-signature") ?? c.req.header("stripe-signature") ?? null;
    const valid = await verifySimpleHmacSignature(signature, body, project.signingSecret);
    if (!valid) {
      return c.text("Invalid signature", 401);
    }
  }

  const eventId = crypto.randomUUID();
  const payloadHash = await sha256Hex(`${method}:${requestUrl.search}:${body}`);
  const deliveryId = c.req.header("x-delivery-id") ?? c.req.header("x-github-delivery") ?? "unknown";
  // Include endpoint path so primary and custom endpoints don't collapse into one event.
  const idempotencyKey = `${project.id}:${endpointPath}:${deliveryId}:${payloadHash}`;
  const r2Key = await putEventPayload(c.env, eventId, body);

  const now = Date.now();
  const inserted = await repos.events.insertOrIgnore({
    id: eventId,
    projectId: project.id,
    projectSlug: project.slug,
    endpointPath,
    r2Key,
    idempotencyKey,
    requestMethod: method,
    requestQueryJson: queryJson,
    requestHeadersJson: JSON.stringify(toHeadersObject(c.req.raw.headers)),
    sourceIp,
    replayOfEventId: null,
    receivedAt: now,
    expiresAt: now + project.retentionDays * 24 * 60 * 60 * 1000
  });

  if (!inserted) {
    return c.json({ received: true, duplicate: true });
  }

  const queuePayload: EnqueuedWebhookEvent = {
    eventId,
    projectId: project.id,
    projectSlug: project.slug,
    endpointPath,
    r2Key,
    headers: toHeadersObject(c.req.raw.headers),
    sourceIp,
    replay: false,
    receivedAt: now
  };
  await c.env.WEBHOOK_QUEUE.send(queuePayload);
  await dispatchToTunnel(c.env, project.slug, endpointPath, eventId, body, toHeadersObject(c.req.raw.headers));

  return c.json({ received: true, eventId });
}

incomingRouter.post("/in/:endpointPath", handleIncoming);
incomingRouter.get("/in/:endpointPath", handleIncoming);
