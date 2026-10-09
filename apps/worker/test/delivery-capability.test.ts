import { afterEach, describe, expect, test, vi } from "vitest";
import type { EnqueuedWebhookEvent } from "@payetonhook/shared";
import {
  boundedDeliveryFetch,
  DeliveryBusy,
  DeliveryReceipt,
} from "../src/lib/delivery-capability";
import type { DeliveryAttemptInsert } from "../src/lib/db";
import { handleQueueBatch } from "../src/queue/consumer";
import {
  runDeliveryWorkflow,
  type DeliveryEnv,
} from "../src/workflows/delivery";
import { migratedDeliveryDb } from "./d1-sqlite";

type Fixture = ReturnType<typeof migratedDeliveryDb>;
const fixtures: Fixture[] = [];
function fixture() {
  const value = migratedDeliveryDb();
  fixtures.push(value);
  value.sqlite.exec(`INSERT INTO projects (id, slug, name, created_at) VALUES
    ('project-a', 'alpha', 'Alpha', 1), ('project-b', 'beta', 'Beta', 1)`);
  return value;
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const value of fixtures.splice(0)) value.close();
});
function destination(
  db: Fixture,
  id: string,
  options: {
    project?: string;
    retries?: number;
    timeout?: number;
    endpoint?: string | null;
    managed?: boolean;
    active?: boolean;
    condition?: string;
    transform?: string;
  } = {},
) {
  db.sqlite
    .prepare(
      `INSERT INTO destinations
    (id, project_id, name, url, headers_json, timeout_ms, max_retries, created_at,
      endpoint_path, managed_by_endpoint, active, condition_expr, transform_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      options.project ?? "project-a",
      id,
      `https://receiver.test/${id}`,
      JSON.stringify({
        "x-webhook-id": "spoofed",
        "X-Webhook-ID": "also-spoofed",
        "X-Webhook-Project": "wrong-project",
        "X-Webhook-Endpoint": "wrong-endpoint",
        "Content-Type": "text/plain",
        "x-custom": "kept",
      }),
      options.timeout ?? 1000,
      options.retries ?? 0,
      options.endpoint ?? null,
      options.managed ? 1 : 0,
      options.active === false ? 0 : 1,
      options.condition ?? null,
      options.transform ?? null,
    );
}
function event(
  db: Fixture,
  id = "event-a",
  replayOf: string | null = null,
): EnqueuedWebhookEvent {
  const r2Key = "events/original.json";
  db.sqlite
    .prepare(
      `INSERT INTO events
    (id, project_id, project_slug, r2_key, idempotency_key, request_headers_json,
      replay_of_event_id, received_at, expires_at, endpoint_path)
    VALUES (?, 'project-a', 'alpha', ?, ?, '{}', ?, 1, 9999999999999, 'endpoint-a')`,
    )
    .run(id, r2Key, `idempotent:${id}`, replayOf);
  return {
    eventId: id,
    projectId: "project-a",
    projectSlug: "alpha",
    endpointPath: "endpoint-a",
    r2Key,
    headers: {},
    sourceIp: null,
    replay: replayOf !== null,
    receivedAt: 1,
  };
}
function attempt(
  overrides: Partial<DeliveryAttemptInsert> = {},
): DeliveryAttemptInsert {
  return {
    id: crypto.randomUUID(),
    eventId: "event-a",
    destinationId: "a",
    attemptNo: 1,
    statusCode: 200,
    success: true,
    responseBodyKey: null,
    errorMessage: null,
    attemptedAt: Date.now(),
    durationMs: 1,
    ...overrides,
  };
}
function rows(db: Fixture, table: "delivery_attempts" | "delivery_receipts") {
  return db.sqlite
    .prepare(
      `SELECT * FROM ${table} ORDER BY event_id, destination_id, ${table === "delivery_attempts" ? "attempt_no" : "attempts"}`,
    )
    .all()
    .map((row) => ({ ...row }));
}
function environment(db: Fixture, fetcher: typeof fetch) {
  const blobs = new Map<string, string>([
    ["events/original.json", '{"type":"paid","amount":42}'],
  ]);
  const put = vi.fn(async (key: string, value: string) => {
    blobs.set(key, value);
    return {};
  });
  const env = {
    DB: db.db,
    fetch: fetcher,
    EVENT_BLOB: {
      get: async (key: string) =>
        blobs.has(key) ? { text: async () => blobs.get(key)! } : null,
      put,
    },
  } as unknown as DeliveryEnv;
  return { env, blobs, put };
}
async function queue(env: DeliveryEnv, body: EnqueuedWebhookEvent) {
  const message = { body, ack: vi.fn(), retry: vi.fn() };
  await handleQueueBatch(env, {
    messages: [message],
  } as unknown as MessageBatch<EnqueuedWebhookEvent>);
  return message;
}

describe("bounded delivery with migrated SQLite receipts", () => {
  test("bounds header/body deadlines and UTF-8 bytes, cancels streams and clears every timer", async () => {
    vi.useFakeTimers();
    const failure = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("transport down"));
    await expect(
      boundedDeliveryFetch(failure, "https://receiver.test", {}, 50),
    ).rejects.toThrow("transport down");
    expect(vi.getTimerCount()).toBe(0);

    let signal: AbortSignal | null | undefined;
    const neverHeaders = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) => {
        signal = init?.signal;
        return new Promise<Response>(() => {});
      });
    const headers = boundedDeliveryFetch(
      neverHeaders,
      "https://receiver.test",
      {},
      50,
    );
    const headersAssertion =
      expect(headers).rejects.toThrow("deadline exceeded");
    await vi.advanceTimersByTimeAsync(50);
    await headersAssertion;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    const cancel = vi.fn();
    const stalled = new ReadableStream<Uint8Array>({ cancel });
    const body = boundedDeliveryFetch(
      vi.fn<typeof fetch>().mockResolvedValue(new Response(stalled)),
      "https://receiver.test",
      {},
      50,
    );
    const bodyAssertion = expect(body).rejects.toThrow("deadline exceeded");
    await vi.advanceTimersByTimeAsync(50);
    await bodyAssertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(stalled.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    const overflowCancel = vi.fn();
    const overflow = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("éé"));
      },
      cancel: overflowCancel,
    });
    await expect(
      boundedDeliveryFetch(
        vi.fn<typeof fetch>().mockResolvedValue(new Response(overflow)),
        "https://receiver.test",
        {},
        50,
        3,
      ),
    ).rejects.toThrow("byte limit");
    expect(overflowCancel).toHaveBeenCalledOnce();
    expect(overflow.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    const exact = await boundedDeliveryFetch(
      vi.fn<typeof fetch>().mockResolvedValue(new Response("éé")),
      "https://receiver.test",
      {},
      50,
      4,
    );
    expect(exact.body).toBe("éé");
    expect(vi.getTimerCount()).toBe(0);
  });

  test("serializes concurrent claims, recovers expired leases and fences stale owners/attempts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const db = fixture();
    destination(db, "a");
    event(db);
    const first = new DeliveryReceipt(db.db, "event-a", "a", 100);
    const second = new DeliveryReceipt(db.db, "event-a", "a", 100);
    const claims = await Promise.allSettled([first.claim(), second.claim()]);
    expect(
      claims.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((claims[1] as PromiseRejectedResult).reason).toBeInstanceOf(
      DeliveryBusy,
    );
    vi.setSystemTime(1101);
    await expect(second.claim()).resolves.toMatchObject({
      state: "pending",
      attempts: 0,
    });
    const recoveredOwner = rows(db, "delivery_receipts")[0]!.lease_owner;
    await expect(first.renew()).rejects.toBeInstanceOf(DeliveryBusy);
    await expect(first.record(attempt(), false)).rejects.toBeInstanceOf(
      DeliveryBusy,
    );
    await first.release();
    expect(rows(db, "delivery_attempts")).toHaveLength(0);
    expect(rows(db, "delivery_receipts")[0]!.lease_owner).toBe(recoveredOwner);
    await second.record(
      attempt({ success: false, statusCode: 503, errorMessage: "retry" }),
      false,
    );
    await second.release();
    const third = new DeliveryReceipt(db.db, "event-a", "a", 100);
    await expect(third.claim()).resolves.toMatchObject({
      state: "pending",
      attempts: 1,
    });
    await expect(third.record(attempt(), false)).rejects.toBeInstanceOf(
      DeliveryBusy,
    );
    await third.renew();
    await third.record(attempt({ attemptNo: 2 }), false);
    const completed = new DeliveryReceipt(db.db, "event-a", "a", 100);
    await expect(completed.claim()).resolves.toMatchObject({
      state: "delivered",
      attempts: 2,
      status_code: 200,
    });
    expect(rows(db, "delivery_attempts").map((row) => row.attempt_no)).toEqual([
      1, 2,
    ]);
    expect(rows(db, "delivery_receipts")[0]).toMatchObject({
      lease_owner: null,
      lease_until: 0,
    });
    event(db, "event-expired");
    const expired = new DeliveryReceipt(db.db, "event-expired", "a", 100);
    await expired.claim();
    vi.setSystemTime(1202);
    await expect(expired.renew()).rejects.toBeInstanceOf(DeliveryBusy);
    await expect(
      expired.record(attempt({ eventId: "event-expired" }), false),
    ).rejects.toBeInstanceOf(DeliveryBusy);
    expect(rows(db, "delivery_attempts")).toHaveLength(2);
  });

  test("rolls back receipt progress when attempt history fails and preserves retryability", async () => {
    const db = fixture();
    destination(db, "a");
    event(db);
    const receipt = new DeliveryReceipt(db.db, "event-a", "a", 60_000);
    await receipt.claim();
    const before = rows(db, "delivery_receipts");
    db.sqlite.exec(
      "CREATE TRIGGER fail_attempt BEFORE INSERT ON delivery_attempts BEGIN SELECT RAISE(ABORT, 'history unavailable'); END",
    );
    await expect(receipt.record(attempt(), false)).rejects.toThrow(
      "history unavailable",
    );
    expect(rows(db, "delivery_receipts")).toEqual(before);
    expect(rows(db, "delivery_attempts")).toHaveLength(0);
    db.sqlite.exec("DROP TRIGGER fail_attempt");
    await receipt.record(attempt(), false);
    expect(rows(db, "delivery_receipts")[0]).toMatchObject({
      state: "delivered",
      attempts: 1,
    });
    expect(rows(db, "delivery_attempts")).toHaveLength(1);
  });

  test("queue replay skips completed siblings, preserves destination scope and delivers intentional new-ID replay", async () => {
    const db = fixture();
    destination(db, "a");
    destination(db, "b", {
      managed: true,
      endpoint: "endpoint-a",
      condition: 'payload.type === "paid"',
      transform: '{"constants":{"transformed":true}}',
    });
    destination(db, "foreign", { project: "project-b" });
    destination(db, "wrong-endpoint", {
      managed: true,
      endpoint: "endpoint-b",
    });
    destination(db, "inactive", { active: false });
    destination(db, "unmatched", { condition: "payload.amount > 100" });
    const message = event(db);
    const calls: Array<{ path: string; headers: Headers; body: string }> = [];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url, init) => {
        calls.push({
          path: new URL(String(url)).pathname,
          headers: new Headers(init?.headers),
          body: String(init?.body),
        });
        return new Response("accepted");
      });
    const { env } = environment(db, fetcher);
    db.sqlite.exec(
      "CREATE TRIGGER fail_b BEFORE INSERT ON delivery_attempts WHEN NEW.destination_id = 'b' BEGIN SELECT RAISE(ABORT, 'partial persistence'); END",
    );
    const initial = await queue(env, message);
    expect(initial.retry).toHaveBeenCalledOnce();
    expect(initial.ack).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(rows(db, "delivery_attempts")).toHaveLength(1),
    );
    db.sqlite.exec("DROP TRIGGER fail_b");
    const retry = await queue(env, message);
    expect(retry.ack).toHaveBeenCalledOnce();
    expect(retry.retry).not.toHaveBeenCalled();
    expect(calls.map((call) => call.path).sort()).toEqual(["/a", "/b", "/b"]);
    expect(rows(db, "delivery_attempts")).toHaveLength(2);
    expect(
      calls.every(
        (call) =>
          call.headers.get("x-webhook-id") === "event-a" &&
          call.headers.get("x-webhook-project") === "alpha" &&
          call.headers.get("x-webhook-endpoint") === "endpoint-a" &&
          call.headers.get("content-type") === "application/json" &&
          call.headers.get("x-custom") === "kept",
      ),
    ).toBe(true);
    expect(
      JSON.parse(calls.find((call) => call.path === "/b")!.body).transformed,
    ).toBe(true);
    const replay = event(db, "event-replay", message.eventId);
    await expect(runDeliveryWorkflow(env, replay)).resolves.toHaveLength(2);
    expect(
      calls.slice(3).map((call) => call.headers.get("x-webhook-id")),
    ).toEqual(["event-replay", "event-replay"]);
    expect(rows(db, "delivery_receipts")).toHaveLength(4);
  });

  test("bounds retries, keeps the event ID stable, persists exhaustion and rejects invalid budgets", async () => {
    vi.useFakeTimers();
    const db = fixture();
    destination(db, "a", { retries: 2 });
    const message = event(db);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockImplementation(async () => new Response("busy", { status: 503 }));
    const { env } = environment(db, fetcher);
    const running = queue(env, message);
    await vi.runAllTimersAsync();
    const delivered = await running;
    expect(delivered.ack).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      fetcher.mock.calls.map(([, init]) =>
        new Headers(init?.headers).get("x-webhook-id"),
      ),
    ).toEqual(["event-a", "event-a", "event-a"]);
    expect(rows(db, "delivery_attempts").map((row) => row.attempt_no)).toEqual([
      1, 2, 3,
    ]);
    expect(rows(db, "delivery_receipts")[0]).toMatchObject({
      state: "exhausted",
      attempts: 3,
      status_code: 503,
    });
    const repeated = await queue(env, message);
    expect(repeated.ack).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    db.sqlite.exec("UPDATE destinations SET max_retries = 21");
    const invalid = await queue(env, event(db, "event-invalid"));
    expect(invalid.retry).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(3);
    db.sqlite.exec("UPDATE destinations SET max_retries = 20");
    const times: number[] = [];
    const maximumFetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => {
        times.push(Date.now());
        return new Response("busy", { status: 503 });
      });
    const maximum = queue(
      environment(db, maximumFetcher).env,
      event(db, "event-maximum"),
    );
    await vi.runAllTimersAsync();
    expect((await maximum).ack).toHaveBeenCalledOnce();
    expect(maximumFetcher).toHaveBeenCalledTimes(21);
    const backoffs = times.slice(1).map((time, index) => time - times[index]!);
    expect(backoffs.slice(0, 3)).toEqual([500, 1000, 2000]);
    expect(Math.max(...backoffs)).toBe(30_000);
    expect(
      rows(db, "delivery_receipts").find(
        (row) => row.event_id === "event-maximum",
      ),
    ).toMatchObject({ state: "exhausted", attempts: 21 });
    expect(vi.getTimerCount()).toBe(0);
  });

  test("infrastructure failures cause queue RETRY without immediate duplicate sends or phantom history", async () => {
    for (const failure of ["receipt", "history", "blob"] as const) {
      const db = fixture();
      destination(db, "a", { retries: 3 });
      const message = event(db);
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => new Response("accepted"));
      const { env, put } = environment(db, fetcher);
      if (failure === "blob")
        put.mockRejectedValueOnce(new Error("blob unavailable"));
      else
        db.sqlite
          .exec(`CREATE TRIGGER fail_storage BEFORE ${failure === "receipt" ? "UPDATE ON delivery_receipts WHEN NEW.attempts = 1" : "INSERT ON delivery_attempts"}
        BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END`);
      const failed = await queue(env, message);
      expect(failed.retry).toHaveBeenCalledOnce();
      expect(failed.ack).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledOnce();
      expect(rows(db, "delivery_attempts")).toHaveLength(0);
      expect(rows(db, "delivery_receipts")[0]).toMatchObject({
        state: "pending",
        attempts: 0,
        lease_owner: null,
        lease_until: 0,
      });
      if (failure !== "blob") db.sqlite.exec("DROP TRIGGER fail_storage");
      const retry = await queue(env, message);
      expect(retry.ack).toHaveBeenCalledOnce();
      expect(retry.retry).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(rows(db, "delivery_attempts")).toHaveLength(1);
      expect(
        fetcher.mock.calls.map(([, init]) =>
          new Headers(init?.headers).get("x-webhook-id"),
        ),
      ).toEqual(["event-a", "event-a"]);
    }
  });
});
