function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  throw new TypeError("Query parameters must be finite JSON values");
}

/** Auth identity is part of every key; switching tenants cannot reuse prior data. */
export function createQueryKeys({ tenantId, actorId, authorizationVersion = "" }) {
  if (![tenantId, actorId].every((x) => typeof x === "string" && x.trim())) {
    throw new TypeError("Tenant and actor identity are required");
  }
  const root = Object.freeze(["tenant", tenantId, "actor", actorId, "authorization", authorizationVersion]);
  return Object.freeze({
    root,
    resource(name) {
      if (typeof name !== "string" || !name.trim()) throw new TypeError("Resource name is required");
      return Object.freeze([...root, name]);
    },
    list(name, parameters = {}) { return Object.freeze([...this.resource(name), JSON.stringify(canonical(parameters))]); },
  });
}

export function asyncState({ pending, error, data, empty }) {
  if (error !== null && error !== undefined) return { kind: "error", error };
  if (data === null || data === undefined) return { kind: pending ? "loading" : "empty" };
  return empty(data) ? { kind: "empty" } : { kind: "ready", data, refreshing: pending };
}
