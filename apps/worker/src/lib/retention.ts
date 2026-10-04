import type { AppBindings } from "../types";

type ExpiredEventRow = {
  id: string;
  r2_key: string;
};

type AttemptBlobRow = {
  response_body_key: string | null;
};

type CleanupResult = {
  deletedEvents: number;
  deletedAttempts: number;
  deletedTunnelAttempts: number;
  deletedReplayRows: number;
  deletedR2Objects: number;
  scanned: number;
};

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

async function deleteR2Keys(bucket: R2Bucket, keys: string[]): Promise<number> {
  if (!keys.length) return 0;
  const chunkSize = 500;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    await bucket.delete(chunk);
  }
  return keys.length;
}

async function cleanupExpiredBatch(env: AppBindings, now: number, batchSize: number): Promise<CleanupResult> {
  const expiredRows = await env.DB.prepare(
    `SELECT id, r2_key
     FROM events
     WHERE expires_at <= ?
     ORDER BY expires_at ASC
     LIMIT ?`
  )
    .bind(now, batchSize)
    .all<ExpiredEventRow>();
  const events = expiredRows.results ?? [];
  const eventIds = events.map((row) => row.id);
  if (!eventIds.length) {
    return {
      deletedEvents: 0,
      deletedAttempts: 0,
      deletedTunnelAttempts: 0,
      deletedReplayRows: 0,
      deletedR2Objects: 0,
      scanned: 0
    };
  }

  const placeholders = eventIds.map(() => "?").join(", ");
  const attemptBlobRows = await env.DB.prepare(
    `SELECT response_body_key
     FROM delivery_attempts
     WHERE event_id IN (${placeholders})
       AND response_body_key IS NOT NULL`
  )
    .bind(...eventIds)
    .all<AttemptBlobRow>();
  const responseBlobKeys = uniqueStrings((attemptBlobRows.results ?? []).map((row) => row.response_body_key));
  const eventBlobKeys = uniqueStrings(events.map((row) => row.r2_key));
  const allBlobKeys = uniqueStrings([...eventBlobKeys, ...responseBlobKeys]);

  await env.DB.prepare(
    `UPDATE events
     SET replay_of_event_id = NULL
     WHERE replay_of_event_id IN (${placeholders})`
  )
    .bind(...eventIds)
    .run();

  let deletedTunnelAttempts = 0;
  try {
    const deleteTunnelAttempts = await env.DB.prepare(
      `DELETE FROM tunnel_attempts
       WHERE event_id IN (${placeholders})`
    )
      .bind(...eventIds)
      .run();
    deletedTunnelAttempts = Number(deleteTunnelAttempts.meta.changes ?? 0);
  } catch {
    deletedTunnelAttempts = 0;
  }

  const deleteAttempts = await env.DB.prepare(
    `DELETE FROM delivery_attempts
     WHERE event_id IN (${placeholders})`
  )
    .bind(...eventIds)
    .run();
  const deletedAttempts = Number(deleteAttempts.meta.changes ?? 0);

  const deleteReplays = await env.DB.prepare(
    `DELETE FROM replays
     WHERE event_id IN (${placeholders})`
  )
    .bind(...eventIds)
    .run();
  const deletedReplayRows = Number(deleteReplays.meta.changes ?? 0);

  const deleteEvents = await env.DB.prepare(
    `DELETE FROM events
     WHERE id IN (${placeholders})`
  )
    .bind(...eventIds)
    .run();
  const deletedEvents = Number(deleteEvents.meta.changes ?? 0);

  const deletedR2Objects = await deleteR2Keys(env.EVENT_BLOB, allBlobKeys);
  return {
    deletedEvents,
    deletedAttempts,
    deletedTunnelAttempts,
    deletedReplayRows,
    deletedR2Objects,
    scanned: events.length
  };
}

export async function runRetentionSweep(env: AppBindings): Promise<void> {
  const batchSizeRaw = Number.parseInt(env.RETENTION_SWEEP_BATCH_SIZE || "250", 10);
  const batchSize = Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? Math.min(batchSizeRaw, 1000) : 250;
  const maxBatches = 20;
  const now = Date.now();

  let totalDeletedEvents = 0;
  let totalDeletedAttempts = 0;
  let totalDeletedTunnelAttempts = 0;
  let totalDeletedReplayRows = 0;
  let totalDeletedR2Objects = 0;
  let totalScanned = 0;

  for (let i = 0; i < maxBatches; i += 1) {
    const result = await cleanupExpiredBatch(env, now, batchSize);
    totalDeletedEvents += result.deletedEvents;
    totalDeletedAttempts += result.deletedAttempts;
    totalDeletedTunnelAttempts += result.deletedTunnelAttempts;
    totalDeletedReplayRows += result.deletedReplayRows;
    totalDeletedR2Objects += result.deletedR2Objects;
    totalScanned += result.scanned;
    if (result.scanned < batchSize) break;
  }

  console.log(
    JSON.stringify({
      event: "retention_sweep_complete",
      batchSize,
      maxBatches,
      totalScanned,
      totalDeletedEvents,
      totalDeletedAttempts,
      totalDeletedTunnelAttempts,
      totalDeletedReplayRows,
      totalDeletedR2Objects
    })
  );
}
