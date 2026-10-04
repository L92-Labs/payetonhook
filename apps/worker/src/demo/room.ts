import {
  DEMO_MAX_BODY_BYTES,
  DEMO_ROOM_IDLE_MS,
  capDemoBody,
  newDemoEventId,
  pushDemoEvent,
  type DemoEvent
} from "./logic";

type SseMessage =
  | { type: "snapshot"; events: DemoEvent[] }
  | { type: "event"; event: DemoEvent };

/**
 * DemoRoom — one Durable Object instance per demo slot. Holds a small
 * in-memory ring of the latest webhook events for the landing-page sandbox
 * and streams them to browsers over SSE. Rooms idle for more than
 * DEMO_ROOM_IDLE_MS are emptied by an alarm sweep.
 */
export class DemoRoom {
  private events: DemoEvent[] = [];
  private createdAt = Date.now();
  private lastTouch = Date.now();
  private writers = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  private encoder = new TextEncoder();

  constructor(private readonly ctx: DurableObjectState, private readonly env: unknown) {
    void this.env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/ingest") {
      return this.handleIngest(request);
    }

    if (request.method === "GET" && url.pathname === "/events") {
      return this.handleEvents(request);
    }

    return new Response("Not found", { status: 404 });
  }

  private touch(): void {
    this.lastTouch = Date.now();
    this.ctx.storage.setAlarm(this.lastTouch + DEMO_ROOM_IDLE_MS).catch(() => {});
  }

  private async handleIngest(request: Request): Promise<Response> {
    const payload = (await request.json().catch(() => null)) as
      | { method?: string; path?: string; body?: string; contentType?: string }
      | null;
    if (!payload || typeof payload.method !== "string") {
      return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }
    const rawBody = typeof payload.body === "string" ? payload.body : "";
    const { body, size } = capDemoBody(rawBody, DEMO_MAX_BODY_BYTES);
    const event: DemoEvent = {
      id: newDemoEventId(),
      method: payload.method.toUpperCase().slice(0, 8),
      path: typeof payload.path === "string" ? payload.path.slice(0, 200) : "/in/demo",
      received_at: new Date().toISOString(),
      body,
      size,
      contentType: typeof payload.contentType === "string" ? payload.contentType.slice(0, 120) : ""
    };
    this.events = pushDemoEvent(this.events, event);
    this.touch();
    this.broadcast({ type: "event", event });
    return Response.json({ ok: true, event: { id: event.id, received_at: event.received_at } });
  }

  private async handleEvents(request: Request): Promise<Response> {
    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();
    this.writers.add(writer);
    this.touch();

    const send = (message: SseMessage) =>
      writer.write(this.encoder.encode(`data: ${JSON.stringify(message)}\n\n`));

    try {
      await send({ type: "snapshot", events: this.events });
    } catch {
      this.writers.delete(writer);
    }

    request.signal.addEventListener("abort", () => {
      this.writers.delete(writer);
      void writer.close().catch(() => {});
    });

    return new Response(readable, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive"
      }
    });
  }

  private broadcast(message: SseMessage): void {
    const frame = this.encoder.encode(`data: ${JSON.stringify(message)}\n\n`);
    for (const writer of this.writers) {
      writer.write(frame).catch(() => {
        this.writers.delete(writer);
      });
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    if (now - this.lastTouch >= DEMO_ROOM_IDLE_MS) {
      // Idle room: drop stored events so slots self-expire. No reschedule —
      // the next ingest or SSE connect re-arms the alarm via touch().
      this.events = [];
      this.createdAt = now;
      this.lastTouch = now;
      return;
    }
    await this.ctx.storage.setAlarm(this.lastTouch + DEMO_ROOM_IDLE_MS);
  }
}
