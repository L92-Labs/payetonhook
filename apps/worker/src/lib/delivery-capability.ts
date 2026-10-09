import type { DeliveryAttemptInsert } from "./db";

export type Receipt = {
  state: "pending" | "delivered" | "exhausted";
  attempts: number;
  status_code: number | null;
  error_message: string | null;
};
export class DeliveryBusy extends Error {}

/** Fenced leases serialize ordinary queue redelivery. HTTP remains at-least-once:
 * remote acceptance followed by process/receipt failure can repeat the request. */
export class DeliveryReceipt {
  private readonly owner = crypto.randomUUID();
  constructor(
    private readonly db: D1Database,
    private readonly eventId: string,
    private readonly destinationId: string,
    private readonly leaseMs: number,
  ) {}

  async claim(): Promise<Receipt> {
    const now = Date.now();
    const claimed = await this.db
      .prepare(
        `INSERT INTO delivery_receipts
      (event_id, destination_id, state, lease_owner, lease_until)
      VALUES (?, ?, 'pending', ?, ?)
      ON CONFLICT(event_id, destination_id) DO UPDATE SET
        lease_owner = excluded.lease_owner, lease_until = excluded.lease_until
      WHERE delivery_receipts.state = 'pending' AND delivery_receipts.lease_until <= ?
      RETURNING state, attempts, status_code, error_message`,
      )
      .bind(
        this.eventId,
        this.destinationId,
        this.owner,
        now + this.leaseMs,
        now,
      )
      .first<Receipt>();
    if (claimed) return claimed;
    const stored = await this.db
      .prepare(
        `SELECT state, attempts, status_code, error_message
      FROM delivery_receipts WHERE event_id = ? AND destination_id = ?`,
      )
      .bind(this.eventId, this.destinationId)
      .first<Receipt>();
    if (stored && stored.state !== "pending") return stored;
    throw new DeliveryBusy(
      "Destination delivery already leased; retry queue message.",
    );
  }

  async renew(): Promise<void> {
    const now = Date.now();
    const result = await this.db
      .prepare(
        `UPDATE delivery_receipts SET lease_until = ?
      WHERE event_id = ? AND destination_id = ? AND state = 'pending'
      AND lease_owner = ? AND lease_until > ?`,
      )
      .bind(
        now + this.leaseMs,
        this.eventId,
        this.destinationId,
        this.owner,
        now,
      )
      .run();
    if (result.meta.changes !== 1)
      throw new DeliveryBusy("Delivery lease lost.");
  }

  async record(
    input: DeliveryAttemptInsert,
    exhausted: boolean,
  ): Promise<void> {
    const terminal = input.success || exhausted;
    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE delivery_receipts SET state = ?, attempts = ?,
        status_code = ?, error_message = ?, lease_until = ?, lease_owner = ?
        WHERE event_id = ? AND destination_id = ? AND state = 'pending'
        AND lease_owner = ? AND lease_until > ? AND attempts = ? RETURNING event_id`,
        )
        .bind(
          input.success ? "delivered" : exhausted ? "exhausted" : "pending",
          input.attemptNo,
          input.statusCode,
          input.errorMessage,
          terminal ? 0 : Date.now() + this.leaseMs,
          terminal ? null : this.owner,
          this.eventId,
          this.destinationId,
          this.owner,
          Date.now(),
          input.attemptNo - 1,
        ),
      this.db
        .prepare(
          `INSERT INTO delivery_attempts
        (id, event_id, destination_id, attempt_no, status_code, success, response_body_key,
          error_message, attempted_at, duration_ms)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
        )
        .bind(
          input.id,
          input.eventId,
          input.destinationId,
          input.attemptNo,
          input.statusCode,
          input.success ? 1 : 0,
          input.responseBodyKey,
          input.errorMessage,
          input.attemptedAt,
          input.durationMs,
        ),
    ]);
    if (!results[0].results?.length)
      throw new DeliveryBusy("Delivery receipt lease lost.");
  }

  async release(): Promise<void> {
    await this.db
      .prepare(
        `UPDATE delivery_receipts SET lease_until = 0, lease_owner = NULL
      WHERE event_id = ? AND destination_id = ? AND lease_owner = ? AND state = 'pending'`,
      )
      .bind(this.eventId, this.destinationId, this.owner)
      .run();
  }
}

/** Deadline covers headers AND body. Bound response capture to 1 MiB. */
export async function boundedDeliveryFetch(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maxBytes = 1024 * 1024,
): Promise<{ response: Response; body: string }> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      void reader?.cancel().catch(() => {});
      reject(new Error("Delivery response deadline exceeded."));
    }, timeoutMs);
  });
  const operation = (async () => {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    if (!response.body) return { response, body: "" };
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          controller.abort();
          void reader.cancel().catch(() => {});
          throw new Error("Delivery response exceeded byte limit.");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return { response, body: new TextDecoder().decode(bytes) };
    } finally {
      reader.releaseLock();
    }
  })();
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
