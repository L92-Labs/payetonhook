import {
  boundedDeliveryFetch,
  DeliveryReceipt,
} from "../lib/delivery-capability";
import type { EnqueuedWebhookEvent } from "@payetonhook/shared";
import { D1Repositories, type Env as DbEnv } from "../lib/db";
import { sendOpsAlert } from "../lib/opsGuard";
import {
  getEventPayload,
  putDeliveryResponse,
  type BlobStore,
} from "../lib/r2";
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
  },
): Promise<DeliveryResult> {
  if (
    !Number.isInteger(destination.maxRetries) ||
    destination.maxRetries < 0 ||
    destination.maxRetries > 20 ||
    !Number.isFinite(destination.timeoutMs) ||
    destination.timeoutMs < 1 ||
    destination.timeoutMs > 120_000
  ) {
    throw new Error("Invalid destination delivery budget.");
  }
  const receipt = new DeliveryReceipt(
    env.DB,
    message.eventId,
    destination.id,
    Math.max(60_000, destination.timeoutMs + 60_000),
  );
  const existing = await receipt.claim();
  if (existing.state !== "pending") {
    return {
      destinationId: destination.id,
      success: existing.state === "delivered",
      statusCode: existing.status_code,
      error: existing.error_message,
    };
  }
  try {
    const headers = new Headers(
      destination.headersJson
        ? (JSON.parse(destination.headersJson) as Record<string, string>)
        : {},
    );
    headers.set("content-type", "application/json");
    headers.set("x-webhook-id", message.eventId);
    headers.set("x-webhook-project", message.projectSlug);
    headers.set("x-webhook-endpoint", message.endpointPath);
    for (
      let attemptNo = existing.attempts + 1;
      attemptNo <= destination.maxRetries + 1;
      attemptNo++
    ) {
      await receipt.renew();
      const attemptId = crypto.randomUUID();
      const startedAt = Date.now();
      let response: Response | undefined;
      let responseBody = "";
      let failure: string | null = null;
      try {
        const result = await boundedDeliveryFetch(
          env.fetch ?? fetch,
          destination.url,
          {
            method: "POST",
            body: payload,
            headers,
          },
          destination.timeoutMs,
        );
        response = result.response;
        responseBody = result.body;
        failure = response.ok ? null : `non-2xx: ${response.status}`;
      } catch (error) {
        failure = error instanceof Error ? error.message : "unknown error";
      }
      // Infrastructure writes must escape to queue retry, never masquerade as
      // transport failure or trigger an immediate duplicate HTTP send.
      const responseBodyKey = responseBody
        ? await putDeliveryResponse(env, attemptId, responseBody)
        : null;
      const success = response?.ok ?? false;
      const exhausted = attemptNo === destination.maxRetries + 1;
      await receipt.record(
        {
          id: attemptId,
          eventId: message.eventId,
          destinationId: destination.id,
          attemptNo,
          statusCode: response?.status ?? null,
          success,
          responseBodyKey,
          errorMessage: failure,
          attemptedAt: Date.now(),
          durationMs: Date.now() - startedAt,
        },
        exhausted,
      );
      if (success || exhausted)
        return {
          destinationId: destination.id,
          success,
          statusCode: response?.status ?? null,
          error: failure,
        };
      await delay(Math.min(30_000, 500 * Math.pow(2, attemptNo - 1)));
    }
    throw new Error(
      "Destination retry budget changed during delivery; operator replay required.",
    );
  } finally {
    await receipt.release();
  }
}

export async function runDeliveryWorkflow(
  env: DeliveryEnv,
  message: EnqueuedWebhookEvent,
): Promise<DeliveryResult[]> {
  const repos = new D1Repositories(env);
  const destinations = await repos.destinations.activeForProjectEndpoint(
    message.projectId,
    message.endpointPath,
  );
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
        headers: message.headers,
      });
      return deliverWithRetries(env, transformed, message, destination);
    }),
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
          error: item.error,
        })),
        totalDestinations: results.length,
      },
    });
  }

  return results;
}
