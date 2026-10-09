export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;
export type Logger<C> = Readonly<Record<LogLevel, (context: C, message: string, fields?: LogFields) => void>>;
export function redact(value: unknown): unknown;
export function createLogger<C>(identity: (context: C) => string, sink?: (line: string) => void, clock?: () => number): Logger<C>;
