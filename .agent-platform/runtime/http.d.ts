export class TransportError extends Error { readonly code: string; constructor(code: string); }
export type TransportResult = { status: number; headers: Headers; body: Uint8Array };
export function createTransport(options: { fetch?: typeof fetch; timeoutMs: number; maxBytes: number }): (input: RequestInfo | URL, init?: RequestInit) => Promise<TransportResult>;
