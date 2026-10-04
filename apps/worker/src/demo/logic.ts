export type DemoEvent = {
  id: string;
  method: string;
  path: string;
  received_at: string;
  body: string;
  size: number;
  contentType: string;
};

export const DEMO_MAX_EVENTS = 20;
export const DEMO_MAX_BODY_BYTES = 8 * 1024;
export const DEMO_SLOT_RE = /^[a-z0-9]{6}$/;
export const DEMO_ROOM_IDLE_MS = 10 * 60 * 1000;

export function isValidDemoSlot(slot: string): boolean {
  return DEMO_SLOT_RE.test(slot);
}

export function newDemoEventId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `evt_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function capDemoBody(body: string, maxBytes = DEMO_MAX_BODY_BYTES): { body: string; size: number } {
  const size = new TextEncoder().encode(body).length;
  if (size <= maxBytes) return { body, size };
  // Byte-safe truncation: cut on a code-point boundary within the cap.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let truncated = decoder.decode(encoder.encode(body).slice(0, maxBytes), { stream: true });
  truncated += decoder.decode();
  truncated += `…[truncated ${size - maxBytes} bytes]`;
  return { body: truncated, size };
}

export function pushDemoEvent(events: DemoEvent[], event: DemoEvent, max = DEMO_MAX_EVENTS): DemoEvent[] {
  const next = [event, ...events];
  if (next.length > max) next.length = max;
  return next;
}
