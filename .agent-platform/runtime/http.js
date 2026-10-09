export class TransportError extends Error {
  constructor(code) { super(code); this.name = "TransportError"; this.code = code; }
}

/** Bounded buffered HTTP for small provider responses; streaming stays in its adapter. */
export function createTransport({ fetch: send = globalThis.fetch, timeoutMs, maxBytes }) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000 ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16_777_216) {
    throw new TransportError("invalid_budget");
  }
  return async (input, init = {}) => {
    const controller = new AbortController();
    const parent = init.signal ?? (input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort(parent.reason);
    if (parent?.aborted) abort(); else parent?.addEventListener("abort", abort, { once: true });
    let timer, reader;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new TransportError("timeout"));
      }, timeoutMs);
      controller.signal.addEventListener("abort", () => reject(
        parent?.aborted ? parent.reason ?? new TransportError("aborted") : new TransportError("timeout"),
      ), { once: true });
    });
    const bounded = (async () => {
      if (controller.signal.aborted) throw parent?.reason ?? new TransportError("aborted");
      const response = await send(input, { ...init, redirect: "error", signal: controller.signal });
      if (controller.signal.aborted) {
        if (response.body) void response.body.cancel().catch(() => {});
        throw new TransportError("aborted");
      }
      reader = response.body?.getReader();
      const parts = []; let size = 0;
      while (reader) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted) throw new TransportError("aborted");
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new TransportError("response_too_large");
        parts.push(value);
      }
      const body = new Uint8Array(size); let offset = 0;
      for (const part of parts) { body.set(part, offset); offset += part.byteLength; }
      return { status: response.status, headers: response.headers, body };
    })();
    try { return await Promise.race([bounded, deadline]); }
    finally {
      clearTimeout(timer); parent?.removeEventListener("abort", abort);
      controller.abort();
      if (reader) void reader.cancel().catch(() => {});
    }
  };
}
