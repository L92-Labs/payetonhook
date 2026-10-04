type TransformInput = {
  payload: unknown;
  headers: Record<string, string>;
  projectId: string;
  eventId: string;
};

type ObjectValue = Record<string, unknown>;
const MAX_TRANSFORM_SPEC_BYTES = 16_000;
const MAX_TRANSFORM_OUTPUT_BYTES = 512_000;

function parseJsonWithFallback(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function getPath(source: unknown, path: string): unknown {
  const normalized = path.replace(/^\$\./, "").replace(/^input\.payload\./, "");
  if (!normalized) {
    return source;
  }
  return normalized.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || typeof acc !== "object") {
      return undefined;
    }
    return (acc as ObjectValue)[key];
  }, source);
}

function setPath(target: ObjectValue, path: string, value: unknown): ObjectValue {
  const segments = path.split(".");
  const result: ObjectValue = structuredClone(target);
  let cursor: ObjectValue = result;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    const next = cursor[key];
    if (next === null || typeof next !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key] as ObjectValue;
  }
  cursor[segments[segments.length - 1]] = value;
  return result;
}

function applyTransformSpec(input: TransformInput, transformCode: string): unknown {
  if (new TextEncoder().encode(transformCode).length > MAX_TRANSFORM_SPEC_BYTES) {
    throw new Error("transform spec too large");
  }
  const spec = JSON.parse(transformCode) as {
    copy?: Array<{ from: string; to: string }>;
    constants?: Record<string, unknown>;
    drop?: string[];
  };
  if (spec.copy && spec.copy.length > 100) {
    throw new Error("transform copy rule limit exceeded");
  }
  if (spec.drop && spec.drop.length > 100) {
    throw new Error("transform drop rule limit exceeded");
  }

  const payloadObj: ObjectValue =
    input.payload !== null && typeof input.payload === "object" ? structuredClone(input.payload as ObjectValue) : { value: input.payload };

  let transformed: ObjectValue = payloadObj;

  for (const rule of spec.copy ?? []) {
    transformed = setPath(transformed, rule.to, getPath(payloadObj, rule.from));
  }

  for (const [key, value] of Object.entries(spec.constants ?? {})) {
    transformed = setPath(transformed, key, value);
  }

  for (const field of spec.drop ?? []) {
    const parts = field.split(".");
    const cloned = structuredClone(transformed);
    let cursor: ObjectValue = cloned;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const next = cursor[parts[i]];
      if (next === null || typeof next !== "object") {
        cursor = {};
        break;
      }
      cursor = next as ObjectValue;
    }
    delete cursor[parts[parts.length - 1]];
    transformed = cloned;
  }

  return transformed;
}

export async function applyTransform(rawPayload: string, transformCode: string | null, context: Omit<TransformInput, "payload">): Promise<string> {
  if (!transformCode) {
    return rawPayload;
  }

  const payload = parseJsonWithFallback(rawPayload);
  const transformed = applyTransformSpec(
    {
      payload,
      headers: context.headers,
      projectId: context.projectId,
      eventId: context.eventId
    },
    transformCode
  );
  const output = JSON.stringify(transformed);
  if (new TextEncoder().encode(output).length > MAX_TRANSFORM_OUTPUT_BYTES) {
    throw new Error("transform output too large");
  }
  return output;
}

function coerceValue(valueLiteral: string): string | number | boolean {
  const v = valueLiteral.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (!Number.isNaN(Number(v))) return Number(v);
  return v.replace(/^["']|["']$/g, "");
}

export async function matchesCondition(rawPayload: string, conditionExpr: string | null): Promise<boolean> {
  if (!conditionExpr) {
    return true;
  }

  // Supported forms:
  // payload.type === "x"
  // payload.amount > 10
  // input.payload.data.status != "ok"
  const match = conditionExpr.trim().match(/^(payload|input\.payload)\.([a-zA-Z0-9_.]+)\s*(===|==|!==|!=|>|<|>=|<=)\s*(.+)$/);
  if (!match) {
    return false;
  }

  const payload = parseJsonWithFallback(rawPayload);
  const left = getPath(payload, match[2]);
  const right = coerceValue(match[4]);
  switch (match[3]) {
    case "===":
    case "==":
      return left == right;
    case "!==":
    case "!=":
      return left != right;
    case ">":
      return Number(left) > Number(right);
    case "<":
      return Number(left) < Number(right);
    case ">=":
      return Number(left) >= Number(right);
    case "<=":
      return Number(left) <= Number(right);
    default:
      return false;
  }
}
