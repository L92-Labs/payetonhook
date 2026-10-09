export function normalizeRequestId(value: unknown, generate?: () => string): string;
export function requireConfig<K extends string>(values: Record<string, unknown>, keys: readonly K[]): Readonly<Record<K, string>>;
