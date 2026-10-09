export class TaskError extends Error {
  constructor(code, task) { super(`${task}: ${code}`); this.name = "TaskError"; this.code = code; }
}

/** Provider-independent task execution. Output validation and deadlines are mandatory. */
export async function runTask(task, input, adapter, signal) {
  const { name, timeoutMs, maxOutputTokens, validate } = task;
  if (!name || typeof validate !== "function" || !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 || timeoutMs > 300_000 || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1) {
    throw new TaskError("invalid_definition", name);
  }
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new TaskError("timeout", name)); }, timeoutMs);
    controller.signal.addEventListener("abort", () => reject(
      signal?.aborted ? signal.reason ?? new TaskError("aborted", name) : new TaskError("timeout", name),
    ), { once: true });
  });
  try {
    if (controller.signal.aborted) throw signal?.reason ?? new TaskError("aborted", name);
    const execute = (async () => {
      const result = await adapter.execute(input, { task: name, signal: controller.signal, maxOutputTokens });
      if (controller.signal.aborted) throw new TaskError("aborted", name);
      if (adapter.recordUsage) await adapter.recordUsage({ ...result.usage, task: name });
      if (controller.signal.aborted) throw new TaskError("aborted", name);
      if (result.usage?.outputTokens !== undefined &&
          (!Number.isSafeInteger(result.usage.outputTokens) || result.usage.outputTokens < 0 || result.usage.outputTokens > maxOutputTokens)) {
        throw new TaskError("output_budget_exceeded", name);
      }
      try { return { value: validate(result.value), usage: result.usage }; }
      catch { throw new TaskError("invalid_output", name); }
    })();
    return await Promise.race([execute, deadline]);
  } finally {
    clearTimeout(timer); signal?.removeEventListener("abort", abort); controller.abort();
  }
}
