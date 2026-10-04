import type { EnqueuedWebhookEvent } from "@payetonhook/shared";
import { D1Repositories, type Env as DbEnv } from "../lib/db";
import { sendOpsAlert } from "../lib/opsGuard";
import { getEventPayload, putDeliveryResponse, type BlobStore } from "../lib/r2";
import { applyTransform, matchesCondition } from "../transform/runner";

export type DeliveryEnv = DbEnv &
  BlobStore & {
    fetch: typeof fetch;
  };

type DeliveryResult = {
  destinationId: string;
  success: boolean;
  statusCode: number | null;
  error: string | null;
};

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function deliverWithRetries(
  env: DeliveryEnv,
  payload: string,
  message: EnqueuedWebhookEvent,
  destination: {
    id: string;
    url: string;
    headersJson: string | null;
    timeoutMs: number;
    maxRetries: number;
  }
): Promise<DeliveryResult> {
  const repos = new D1Repositories(env);
  const extraHeaders = destination.headersJson ? (JSON.parse(destination.headersJson) as Record<string, string>) : {};

  for (let attemptNo = 1; attemptNo <= destination.maxRetries + 1; attemptNo += 1) {
    const attemptId = crypto.randomUUID();
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), destination.timeoutMs);
      const response = await fetch(destination.url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-webhook-id": message.eventId,
          "x-webhook-project": message.projectSlug,
          "x-webhook-endpoint": message.endpointPath,
          ...extraHeaders
        },
        body: payload
      });
      clearTimeout(timeout);

      const responseBody = await response.text();
      const responseBodyKey = responseBody ? await putDeliveryResponse(env, attemptId, responseBody) : null;

      await repos.attempts.insert({
        id: attemptId,
        eventId: message.eventId,
        destinationId: destination.id,
        attemptNo,
        statusCode: response.status,
        success: response.ok,
        responseBodyKey,
        errorMessage: response.ok ? null : `non-2xx: ${response.status}`,
        attemptedAt: Date.now(),
        durationMs: Date.now() - startedAt
      });

      if (response.ok) {
        return {
          destinationId: destination.id,
          success: true,
          statusCode: response.status,
          error: null
        };
      }
    } catch (error) {
      await repos.attempts.insert({
        id: attemptId,
        eventId: message.eventId,
        destinationId: destination.id,
        attemptNo,
        statusCode: null,
        success: false,
        responseBodyKey: null,
        errorMessage: error instanceof Error ? error.message : "unknown error",
        attemptedAt: Date.now(),
        durationMs: Date.now() - startedAt
      });
    }

    if (attemptNo <= destination.maxRetries) {
      const backoffMs = Math.min(30_000, 500 * Math.pow(2, attemptNo - 1));
      await delay(backoffMs);
    }
  }

  return {
    destinationId: destination.id,
    success: false,
    statusCode: null,
    error: "max retries exhausted"
  };
}

export async function runDeliveryWorkflow(env: DeliveryEnv, message: EnqueuedWebhookEvent): Promise<DeliveryResult[]> {
  const repos = new D1Repositories(env);
  const destinations = await repos.destinations.activeForProjectEndpoint(message.projectId, message.endpointPath);
  const raw = await getEventPayload(env, message.r2Key);

  const matched = [];
  for (const destination of destinations) {
    const isMatch = await matchesCondition(raw, destination.conditionExpr);
    if (isMatch) {
      matched.push(destination);
    }
  }

  const results = await Promise.all(
    matched.map(async (destination) => {
      const transformed = await applyTransform(raw, destination.transformCode, {
        projectId: message.projectId,
        eventId: message.eventId,
        headers: message.headers
      });
      return deliverWithRetries(env, transformed, message, destination);
    })
  );

  const failed = results.filter((result) => !result.success);
  if (failed.length > 0) {
    await sendOpsAlert(env, {
      type: "delivery_failure",
      projectId: message.projectId,
      projectSlug: message.projectSlug,
      summary: `${failed.length} destination(s) failed for event ${message.eventId}`,
      details: {
        eventId: message.eventId,
        failedDestinations: failed.map((item) => ({
          destinationId: item.destinationId,
          statusCode: item.statusCode,
          error: item.error
        })),
        totalDestinations: results.length
      }
    });
  }

  return results;
}
