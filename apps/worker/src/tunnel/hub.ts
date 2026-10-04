type TunnelSubscriber = {
  id: string;
  projectSlug: string;
  endpointPath: string | null;
  workerUrl: string;
  targetUrl: string;
  deviceLabel: string | null;
  hostname: string | null;
  os: string | null;
  platform: string | null;
  nodeVersion: string | null;
  userAgent: string | null;
  sourceIp: string | null;
  country: string | null;
  connectedAt: number;
  lastActivity: number;
  eventsForwarded: number;
  deliveriesOk: number;
  deliveriesFailed: number;
  lastError: string | null;
};

type TunnelEvent = {
  id: string;
  sourceEventId: string;
  payload: string;
  headers: Record<string, string>;
  receivedAt: number;
};

export class TunnelHub {
  private subscribers = new Map<string, TunnelSubscriber>();
  private pending = new Map<string, TunnelEvent[]>();

  constructor(private readonly ctx: DurableObjectState, private readonly env: unknown) {
    void this.ctx;
    void this.env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/list") {
      const now = Date.now();
      const tunnels = [...this.subscribers.values()].map((sub) => {
        const timeSinceActivity = now - sub.lastActivity;
        const status = timeSinceActivity < 30000 ? "live" : timeSinceActivity < 300000 ? "idle" : "stale";
        return { ...sub, status };
      });
      return Response.json({ tunnels });
    }

    if (request.method === "POST" && url.pathname === "/register") {
      const body = (await request.json()) as Omit<
        TunnelSubscriber,
        "connectedAt" | "lastActivity" | "eventsForwarded" | "deliveriesOk" | "deliveriesFailed" | "lastError"
      >;
      const now = Date.now();
      this.subscribers.set(body.id, {
        ...body,
        connectedAt: now,
        lastActivity: now,
        eventsForwarded: 0,
        deliveriesOk: 0,
        deliveriesFailed: 0,
        lastError: null
      });
      this.pending.set(body.id, []);
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/unregister") {
      const body = (await request.json()) as { id: string };
      this.subscribers.delete(body.id);
      this.pending.delete(body.id);
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/dispatch") {
      const body = (await request.json()) as {
        projectSlug: string;
        endpointPath: string;
        sourceEventId: string;
        payload: string;
        headers: Record<string, string>;
      };
      const matches = [...this.subscribers.values()].filter(
        (s) => s.projectSlug === body.projectSlug && (!s.endpointPath || s.endpointPath === body.endpointPath)
      );
      const now = Date.now();
      for (const sub of matches) {
        const queue = this.pending.get(sub.id) ?? [];
        queue.push({
          id: crypto.randomUUID(),
          sourceEventId: body.sourceEventId,
          payload: body.payload,
          headers: body.headers,
          receivedAt: now
        });
        // Keep memory bounded per subscriber.
        if (queue.length > 200) {
          queue.splice(0, queue.length - 200);
        }
        this.pending.set(sub.id, queue);

        // Update subscriber activity
        const subscriber = this.subscribers.get(sub.id);
        if (subscriber) {
          subscriber.lastActivity = now;
        }
      }
      return Response.json({ dispatched: matches.length });
    }

    if (request.method === "GET" && url.pathname === "/subscriber") {
      const id = url.searchParams.get("id");
      if (!id) return new Response("Missing id", { status: 400 });
      const subscriber = this.subscribers.get(id);
      if (!subscriber) return new Response("Not found", { status: 404 });
      return Response.json({ subscriber });
    }

    if (request.method === "GET" && url.pathname === "/pull") {
      const id = url.searchParams.get("id");
      if (!id) {
        return new Response("Missing id", { status: 400 });
      }
      const limit = Math.max(1, Math.min(20, Number(url.searchParams.get("limit") ?? "10")));
      const queue = this.pending.get(id) ?? [];
      const events = queue.splice(0, limit);
      this.pending.set(id, queue);

      // Track forwarded events and update activity
      const subscriber = this.subscribers.get(id);
      if (subscriber && events.length > 0) {
        subscriber.eventsForwarded += events.length;
        subscriber.lastActivity = Date.now();
      }

      return Response.json({ events });
    }

    if (request.method === "POST" && url.pathname === "/report") {
      const body = (await request.json()) as { id: string; ok: boolean; error?: string | null };
      const subscriber = this.subscribers.get(body.id);
      if (!subscriber) return new Response("Not found", { status: 404 });
      if (body.ok) {
        subscriber.deliveriesOk += 1;
      } else {
        subscriber.deliveriesFailed += 1;
        subscriber.lastError = body.error ? String(body.error).slice(0, 500) : "unknown forward error";
      }
      subscriber.lastActivity = Date.now();
      return Response.json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  }
}
