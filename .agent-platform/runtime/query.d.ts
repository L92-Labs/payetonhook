export type QueryScope = { tenantId: string; actorId: string; authorizationVersion?: string };
export type QueryKeys = { readonly root: readonly string[]; resource(name: string): readonly string[]; list(name: string, parameters?: unknown): readonly string[] };
export function createQueryKeys(scope: QueryScope): Readonly<QueryKeys>;
export type AsyncState<T> = { kind: "loading" } | { kind: "error"; error: unknown } | { kind: "empty" } | { kind: "ready"; data: T; refreshing: boolean };
export function asyncState<T>(options: { pending: boolean; error?: unknown; data?: T | null; empty: (data: T) => boolean }): AsyncState<T>;
