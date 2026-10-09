function freeze(value) {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
export const blueprints = freeze([
  { name: "worker-api", version: "1.0.0", template: "worker-hono", platformVersion: "1.0.0",
    contracts: ["request-id", "redacted-logging", "bounded-json-transport", "named-ai-task", "atomic-command"],
    checks: ["typecheck", "test", "check:architecture"],
    recipe: "Adapters own provider I/O. Routes validate input and call domain commands. Streaming uses an explicit bounded streaming adapter." },
  { name: "saas-web", version: "1.0.0", template: "next-hono", platformVersion: "1.0.0",
    contracts: ["request-id", "redacted-logging", "scoped-query-key", "async-state", "atomic-command"],
    checks: ["typecheck", "test", "check:architecture"],
    recipe: "Components use query hooks. Keys include tenant, actor, authorization version, and filters. Render loading, error, empty, ready, and refreshing states." },
]);
export async function blueprintDigest(blueprint) {
  const bytes = new TextEncoder().encode(JSON.stringify(blueprint));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}
export async function validateBlueprint(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !["name", "version", "digest"].includes(key))) {
    throw new Error("Expected blueprint name, version, and digest");
  }
  const selected = blueprints.find(item => item.name === input.name && item.version === input.version);
  if (!selected || typeof input.digest !== "string" || input.digest !== await blueprintDigest(selected)) {
    throw new Error("Unknown blueprint or digest mismatch");
  }
  return selected;
}
