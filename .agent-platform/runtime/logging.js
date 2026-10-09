const sensitive = /^(proxy[-_])?(authorization|cookie|set-cookie|password|passwd|secret|token|api[-_]?key|access[-_]?token|refresh[-_]?token|credential)s?$|(?:secret|password|token|api[-_]?key|secret[-_]?access[-_]?key|private[-_]?key|signing[-_]?key)$/i;

/** Redact structured credentials; bound recursion and preserve safe diagnostics. */
export function redact(value, seen = new WeakSet(), depth = 0) {
  if (depth > 12) return "[truncated]";
  if (typeof value === "bigint") return String(value);
  if (typeof value === "string") return value.replace(/(Bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
    .replace(/([?&](?:[^=&#\s]*(?:token|secret|password|api[-_]?key))=)[^&#\s]*/gi, "$1[redacted]");
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (value instanceof Error) return { name: value.name, message: redact(value.message) };
  if (value instanceof Headers) return redact(Object.fromEntries(value), seen, depth + 1);
  const entries = Array.isArray(value)
    ? value.map((item) => redact(item, seen, depth + 1))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, sensitive.test(key) ? "[redacted]" : redact(item, seen, depth + 1),
    ]));
  seen.delete(value);
  return entries;
}

/** Context adapter supplies request identity; reserved fields cannot be replaced. */
export function createLogger(identity, sink = (line) => console.log(line), clock = Date.now) {
  const emit = (level, context, message, fields) => sink(JSON.stringify({
    ...redact(fields ?? {}), level, ts: clock(), requestId: identity(context),
    message: redact(message),
  }));
  return Object.freeze(Object.fromEntries(["debug", "info", "warn", "error"].map(
    (level) => [level, (context, message, fields) => emit(level, context, message, fields)],
  )));
}
