import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { redact, createLogger } from "../runtime/logging.js";
import { normalizeRequestId, requireConfig } from "../runtime/request.js";
import { createTransport, TransportError } from "../runtime/http.js";
import { runTask, TaskError } from "../runtime/task.js";
import { createQueryKeys, asyncState } from "../runtime/query.js";
import { runCommand, consumeEvent } from "../runtime/command.js";

const never = () => new Promise(() => {});
const task = (overrides = {}) => ({
  name: "extract-receipt", timeoutMs: 50, maxOutputTokens: 80,
  validate(value) {
    if (!value || typeof value.amount !== "number") throw new TypeError("invalid amount");
    return { amount: value.amount };
  },
  ...overrides,
});
const errorCode = (code, ErrorType) => (error) => error instanceof ErrorType && error.code === code;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

// This adapter models atomic persistence, including claims, audit and outbox writes.
// Failed callbacks never publish their transaction's mutations.
function atomicStore(initial) {
  let state = structuredClone(initial);
  return {
    read: () => structuredClone(state),
    async transaction(work) {
      const tx = structuredClone(state);
      const result = await work(tx);
      state = tx;
      return result;
    },
  };
}

test("logging redacts nested credentials, bearer strings, headers and errors without mutating inputs", () => {
  const secret = "sensitive-value";
  const input = {
    label: "safe", count: 2n,
    credentials: { password: secret },
    R2_SECRET_ACCESS_KEY: secret, secretAccessKey: secret, privateKey: secret, signingKey: secret,
    nested: [{ apiKey: secret, clientSecret: secret, message: `Bearer ${secret}` }],
    headers: new Headers({ authorization: `Basic ${secret}`, cookie: secret, "x-trace": "safe" }),
    error: new Error(`Provider rejected Bearer ${secret}`),
    endpoint: `https://user:${secret}@provider.test/v1?api_key=${secret}&safe=ok`,
    database: `postgres://user:${secret}@database.test/app`,
  };
  input.self = input;
  const output = redact(input);
  assert.equal(JSON.stringify(output).includes(secret), false);
  assert.equal(output.label, "safe");
  assert.equal(output.headers["x-trace"], "safe");
  assert.equal(output.count, "2");
  assert.equal(output.self, "[circular]");
  assert.equal(input.nested[0].apiKey, secret);
});

test("logging redacts proxy authorization headers carrying basic credentials", () => {
  const output = redact(new Headers({ "proxy-authorization": "Basic cHJveHktc2VjcmV0" }));
  assert.equal(output["proxy-authorization"], "[redacted]");
});

test("logger keeps trusted identity, severity and timestamp over untrusted reserved fields", () => {
  const lines = [];
  const logger = createLogger((context) => context.id, (line) => lines.push(line), () => 123);
  logger.warn({ id: "trusted-id" }, "safe", {
    level: "debug", requestId: "spoofed", ts: 999, message: "spoofed", token: "secret", extra: 42,
  });
  assert.deepEqual(JSON.parse(lines[0]), {
    level: "warn", requestId: "trusted-id", ts: 123, message: "safe", token: "[redacted]", extra: 42,
  });
  assert.ok(Object.isFrozen(logger));
});

test("request identity rejects control characters and overlong IDs; config rejects blank values", () => {
  assert.equal(normalizeRequestId("request-1:ok.test_2", () => "generated"), "request-1:ok.test_2");
  for (const value of ["", "a\nb", " a", "a".repeat(129), 123, null]) {
    assert.equal(normalizeRequestId(value, () => "generated"), "generated");
  }
  assert.equal(normalizeRequestId("a".repeat(128)), "a".repeat(128));
  const config = requireConfig({ URL: " https://example.test ", OPTIONAL: "unused" }, ["URL"]);
  assert.deepEqual(config, { URL: "https://example.test" });
  assert.ok(Object.isFrozen(config));
  for (const value of [undefined, "  ", 5]) {
    assert.throws(() => requireConfig({ TOKEN: value }, ["TOKEN"]), /Missing configuration: TOKEN/);
  }
});

test("transport enforces valid budgets and permits exactly the byte limit with redirects disabled", async () => {
  for (const [timeoutMs, maxBytes] of [[0, 1], [300001, 1], [1.5, 1], [1, 0], [1, 16777217]]) {
    assert.throws(() => createTransport({ timeoutMs, maxBytes }), errorCode("invalid_budget", TransportError));
  }
  let options;
  const transport = createTransport({ timeoutMs: 200, maxBytes: 4, fetch: async (_, init) => {
    options = init;
    return new Response(new Uint8Array([1, 2, 3, 4]), { status: 201, headers: { "x-provider": "one" } });
  } });
  const result = await transport("https://example.test", { redirect: "follow", method: "POST" });
  assert.equal(options.redirect, "error");
  assert.equal(options.method, "POST");
  assert.equal(result.status, 201);
  assert.equal(result.headers.get("x-provider"), "one");
  assert.deepEqual(result.body, new Uint8Array([1, 2, 3, 4]));
  assert.equal(options.signal.aborted, true);
});

test("transport cancels the reader when a multichunk body exceeds its budget", async () => {
  let canceled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.enqueue(new Uint8Array([3, 4, 5]));
    },
    cancel() { canceled = true; },
  });
  const transport = createTransport({ timeoutMs: 200, maxBytes: 4, fetch: async () => new Response(stream) });
  await assert.rejects(transport("https://example.test"), errorCode("response_too_large", TransportError));
  assert.equal(canceled, true);
});

test("transport deadline rejects even when fetch ignores cancellation", { timeout: 1000 }, async () => {
  let adapterSignal;
  const transport = createTransport({ timeoutMs: 25, maxBytes: 4, fetch: (_, init) => {
    adapterSignal = init.signal;
    return never();
  } });
  await assert.rejects(transport("https://example.test"), errorCode("timeout", TransportError));
  assert.equal(adapterSignal.aborted, true);
});

test("transport deadline covers stalled body reads and releases the reader", { timeout: 1000 }, async () => {
  let canceled = false;
  const stream = new ReadableStream({ cancel() { canceled = true; } });
  const transport = createTransport({ timeoutMs: 25, maxBytes: 4, fetch: async () => new Response(stream) });
  await assert.rejects(transport("https://example.test"), errorCode("timeout", TransportError));
  assert.equal(canceled, true);
});

test("transport preserves caller cancellation before fetch and during an uncooperative fetch", { timeout: 1000 }, async () => {
  const reason = new Error("caller canceled");
  const before = new AbortController();
  before.abort(reason);
  let called = false;
  const preCanceled = createTransport({ timeoutMs: 200, maxBytes: 4, fetch: async () => { called = true; } });
  await assert.rejects(preCanceled("https://example.test", { signal: before.signal }), (error) => error === reason);
  assert.equal(called, false);
  const during = new AbortController();
  const transport = createTransport({ timeoutMs: 200, maxBytes: 4, fetch: never });
  const result = transport(new Request("https://example.test", { signal: during.signal }));
  during.abort(reason);
  await assert.rejects(result, (error) => error === reason);
});

test("transport cancels a response that arrives after the deadline instead of reading it forever", { timeout: 1000 }, async () => {
  const response = deferred();
  let canceled = false;
  let controller;
  const stream = new ReadableStream({
    start(value) { controller = value; },
    cancel() { canceled = true; },
  });
  const transport = createTransport({ timeoutMs: 25, maxBytes: 4, fetch: () => response.promise });
  await assert.rejects(transport("https://example.test"), errorCode("timeout", TransportError));
  response.resolve(new Response(stream));
  try {
    await delay(10);
    assert.equal(canceled, true, "late provider body must be canceled after its request timed out");
  } finally {
    try { controller.close(); } catch { /* already canceled by the transport */ }
  }
});

test("task validates output, forwards budgets and records provider usage against trusted task identity", async () => {
  const usage = [];
  let adapterContext;
  const result = await runTask(task(), "receipt", {
    async execute(input, context) {
      assert.equal(input, "receipt");
      adapterContext = context;
      return { value: { amount: 15, providerField: "discard" }, usage: { outputTokens: 5, provider: "fixture", task: "spoofed" } };
    },
    recordUsage(record) { usage.push(record); },
  });
  assert.deepEqual(result.value, { amount: 15 });
  assert.equal(adapterContext.task, "extract-receipt");
  assert.equal(adapterContext.maxOutputTokens, 80);
  assert.equal(adapterContext.signal.aborted, true);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].task, "extract-receipt", "provider metadata must not replace task identity");
  assert.equal(usage[0].outputTokens, 5);
});

test("task rejects malformed output with a stable failure without leaking validator details", async () => {
  await assert.rejects(runTask(task(), null, { execute: async () => ({ value: { amount: "wrong" } }) }),
    (error) => error instanceof TaskError && error.code === "invalid_output" && !error.message.includes("invalid amount"));
});

test("task rejects reported output above its token budget", async () => {
  for (const outputTokens of [81, -1, NaN, 1.5]) {
    await assert.rejects(runTask(task(), null, {
      execute: async () => ({ value: { amount: 15 }, usage: { inputTokens: 3, outputTokens } }),
    }), (error) => error instanceof TaskError && /budget/.test(error.code));
  }
});

test("task rejects invalid definitions before calling a provider", async () => {
  let calls = 0;
  const adapter = { execute: async () => { calls += 1; return { value: { amount: 1 } }; } };
  for (const override of [{ name: "" }, { validate: null }, { timeoutMs: 0 }, { timeoutMs: 300001 }, { maxOutputTokens: 0 }, { maxOutputTokens: 1.5 }]) {
    await assert.rejects(runTask(task(override), null, adapter), errorCode("invalid_definition", TaskError));
  }
  assert.equal(calls, 0);
});

test("task deadlines cover uncooperative providers and usage recorders; late providers cannot report usage", { timeout: 1500 }, async () => {
  const late = deferred();
  let records = 0;
  let signal;
  await assert.rejects(runTask(task({ timeoutMs: 25 }), null, {
    execute: (_, context) => { signal = context.signal; return late.promise; },
    recordUsage: () => { records += 1; },
  }), errorCode("timeout", TaskError));
  assert.equal(signal.aborted, true);
  late.resolve({ value: { amount: 5 }, usage: { outputTokens: 1 } });
  await delay(0);
  assert.equal(records, 0);
  await assert.rejects(runTask(task({ timeoutMs: 25 }), null, {
    execute: async () => ({ value: { amount: 5 } }), recordUsage: never,
  }), errorCode("timeout", TaskError));
  const lateUsage = deferred();
  let validations = 0;
  await assert.rejects(runTask(task({ timeoutMs: 25, validate(value) { validations += 1; return value; } }), null, {
    execute: async () => ({ value: { amount: 5 } }), recordUsage: () => lateUsage.promise,
  }), errorCode("timeout", TaskError));
  lateUsage.resolve();
  await delay(0);
  assert.equal(validations, 0, "output validation must not run after task cancellation");
});

test("task preserves caller cancellation and prevents pre-canceled provider execution", { timeout: 1000 }, async () => {
  const reason = new Error("caller canceled");
  const before = new AbortController();
  before.abort(reason);
  let calls = 0;
  await assert.rejects(runTask(task(), null, {
    execute: async () => { calls += 1; return { value: { amount: 1 } }; },
  }, before.signal), (error) => error === reason);
  assert.equal(calls, 0);
  const during = new AbortController();
  const promise = runTask(task({ timeoutMs: 200 }), null, { execute: never }, during.signal);
  during.abort(reason);
  await assert.rejects(promise, (error) => error === reason);
});

test("query keys isolate tenant, actor and authorization version while canonicalizing JSON parameters", () => {
  const base = { tenantId: "tenant-one", actorId: "actor-one", authorizationVersion: "v1" };
  const keys = createQueryKeys(base);
  const first = keys.list("receipts", { filter: { z: 2, a: 1 }, page: 0 });
  assert.deepEqual(first, keys.list("receipts", { page: 0, filter: { a: 1, z: 2 } }));
  for (const override of [{ tenantId: "tenant-two" }, { actorId: "actor-two" }, { authorizationVersion: "v2" }]) {
    assert.notDeepEqual(first, createQueryKeys({ ...base, ...override }).list("receipts", { filter: { z: 2, a: 1 }, page: 0 }));
  }
  assert.ok(Object.isFrozen(keys) && Object.isFrozen(keys.root) && Object.isFrozen(first));
  assert.deepEqual(keys.list("receipts", undefined), keys.list("receipts"));
  for (const value of [NaN, Infinity, new Date(), { value: undefined }, () => {}]) {
    assert.throws(() => keys.list("receipts", value), TypeError);
  }
  assert.throws(() => createQueryKeys({ tenantId: " ", actorId: "actor" }), TypeError);
  assert.throws(() => keys.resource(" "), TypeError);
});

test("async state distinguishes loading, empty, ready refreshes and failure", () => {
  const empty = (rows) => rows.length === 0;
  assert.deepEqual(asyncState({ pending: true, empty }), { kind: "loading" });
  assert.deepEqual(asyncState({ pending: false, empty }), { kind: "empty" });
  assert.deepEqual(asyncState({ pending: false, empty, data: [] }), { kind: "empty" });
  const data = [1];
  assert.deepEqual(asyncState({ pending: true, empty, data }), { kind: "ready", data, refreshing: true });
  const error = new Error("failed");
  assert.deepEqual(asyncState({ pending: true, empty, data, error }), { kind: "error", error });
});

test("command orders authorization, execution, audit and outbox in one transaction; every failure rolls back", async () => {
  for (const failAt of [undefined, "authorize", "execute", "audit", "enqueue"]) {
    const store = atomicStore({ rows: [], audit: [], outbox: [] });
    const calls = [];
    let sharedTx;
    const hook = (name, action) => async (tx, input, result) => {
      sharedTx ??= tx;
      assert.equal(tx, sharedTx);
      calls.push(name);
      action(tx, input, result);
      if (name === failAt) throw new Error(`${name} failed`);
      return name === "execute" ? { id: input.id } : undefined;
    };
    const command = {
      transaction: store.transaction,
      authorize: hook("authorize", () => {}),
      execute: hook("execute", (tx, input) => tx.rows.push(input.id)),
      audit: hook("audit", (tx, _, result) => tx.audit.push(result.id)),
      enqueue: hook("enqueue", (tx, _, result) => tx.outbox.push(result.id)),
    };
    if (failAt) {
      await assert.rejects(runCommand({ id: "receipt-1" }, command), new RegExp(`${failAt} failed`));
      assert.deepEqual(store.read(), { rows: [], audit: [], outbox: [] });
      assert.deepEqual(calls, ["authorize", "execute", "audit", "enqueue"].slice(0, ["authorize", "execute", "audit", "enqueue"].indexOf(failAt) + 1));
    } else {
      assert.deepEqual(await runCommand({ id: "receipt-1" }, command), { id: "receipt-1" });
      assert.deepEqual(calls, ["authorize", "execute", "audit", "enqueue"]);
      assert.deepEqual(store.read(), { rows: ["receipt-1"], audit: ["receipt-1"], outbox: ["receipt-1"] });
    }
  }
});

test("event receipts deduplicate projections, rollback failed claims, and reject malformed envelopes before transactions", async () => {
  const event = { id: "event-1", type: "receipt.created", version: 1, payload: { amount: 2 } };
  const store = atomicStore({ receipts: [], sum: 0 });
  let transactions = 0;
  let fail = true;
  const consumer = {
    transaction: (work) => { transactions += 1; return store.transaction(work); },
    async claim(tx, incoming) {
      if (tx.receipts.includes(incoming.id)) return false;
      tx.receipts.push(incoming.id);
      return true;
    },
    async apply(tx, incoming) {
      tx.sum += incoming.payload.amount;
      if (fail) throw new Error("projection failed");
    },
  };
  await assert.rejects(consumeEvent(event, consumer), /projection failed/);
  assert.deepEqual(store.read(), { receipts: [], sum: 0 });
  fail = false;
  assert.deepEqual(await consumeEvent(event, consumer), { duplicate: false });
  assert.deepEqual(await consumeEvent(event, consumer), { duplicate: true });
  assert.deepEqual(store.read(), { receipts: ["event-1"], sum: 2 });
  const before = transactions;
  for (const override of [{ id: "" }, { type: "" }, { version: 0 }, { version: 1.5 }, { id: 123 }, { type: {} }]) {
    await assert.rejects(consumeEvent({ ...event, ...override }, consumer), TypeError);
  }
  assert.equal(transactions, before);
});
