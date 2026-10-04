import { describe, expect, it } from "vitest";
import { applyTransform, matchesCondition } from "../src/transform/runner";

describe("transform runner", () => {
  it("applies copy and constant rules", async () => {
    const raw = JSON.stringify({ data: { customer: { id: "cus_123" } }, type: "payment.succeeded" });
    const transform = JSON.stringify({
      copy: [{ from: "$.data.customer.id", to: "userId" }],
      constants: { source: "stripe" }
    });
    const out = await applyTransform(raw, transform, {
      projectId: "proj_1",
      eventId: "evt_1",
      headers: {}
    });
    expect(JSON.parse(out)).toMatchObject({
      userId: "cus_123",
      source: "stripe"
    });
  });

  it("evaluates simple conditions", async () => {
    const raw = JSON.stringify({ type: "payment_intent.succeeded", amount: 42 });
    await expect(matchesCondition(raw, 'payload.type === "payment_intent.succeeded"')).resolves.toBe(true);
    await expect(matchesCondition(raw, "payload.amount > 100")).resolves.toBe(false);
  });
});
