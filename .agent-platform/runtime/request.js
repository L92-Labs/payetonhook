/** Accept only bounded printable correlation IDs; never trust arbitrary header text. */
export function normalizeRequestId(value, generate = () => crypto.randomUUID()) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
    ? value : generate();
}

export function requireConfig(values, keys) {
  return Object.freeze(Object.fromEntries(keys.map((key) => {
    const value = values[key];
    if (typeof value !== "string" || !value.trim()) throw new Error(`Missing configuration: ${key}`);
    return [key, value.trim()];
  })));
}
