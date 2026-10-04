import { Hono } from "hono";
import { incomingRouter } from "./routes/incoming";
import { authRouter } from "./routes/auth";
import { apiRouter } from "./routes/api";
import { tunnelRouter } from "./routes/tunnel";
import { demoRouter } from "./routes/demo";
import type { AppBindings } from "./types";
import { handleQueueBatch } from "./queue/consumer";
import { TunnelHub } from "./tunnel/hub";
import { DemoRoom } from "./demo/room";
import { runRetentionSweep } from "./lib/retention";

const app = new Hono<{ Bindings: AppBindings }>();
app.get("/", (c) => c.json({ ok: true, service: "payetonhook-worker" }));
app.route("/", demoRouter);
app.route("/", incomingRouter);
app.route("/", authRouter);
app.route("/", apiRouter);
app.route("/", tunnelRouter);

export default {
  fetch: app.fetch,
  queue: async (batch: MessageBatch<any>, env: AppBindings) => {
    await handleQueueBatch(env as any, batch as any);
  },
  scheduled: async (_controller: ScheduledController, env: AppBindings, ctx: ExecutionContext) => {
    ctx.waitUntil(runRetentionSweep(env));
  }
};

export { TunnelHub };
export { DemoRoom };
