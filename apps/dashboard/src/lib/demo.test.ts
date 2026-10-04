import { beforeAll, describe, expect, it } from "vitest";
import { demoRequest } from "./demo";

const checkoutId = "prj-checkout";

async function listEventIds(projectId: string): Promise<string[]> {
  const data = await demoRequest<{ events: Array<{ id: string }> }>("GET", `/api/projects/${projectId}/events?limit=100`);
  return data.events.map((event) => event.id);
}

describe("demo fixtures", () => {
  beforeAll(async () => {
    await demoRequest("GET", "/api/me");
  });

  it("serves three projects and a demo user (auth gate bypass)", async () => {
    const me = await demoRequest<{ user: { email: string } }>("GET", "/api/me");
    expect(me.user.email).toContain("@l92-labs.com");
    const projects = await demoRequest<{ projects: Array<{ slug: string }> }>("GET", "/api/projects");
    expect(projects.projects.map((p) => p.slug)).toEqual(["checkout", "notifications", "sandbox"]);
  });

  it("serves ~30 events across projects with payloads, attempts and tunnel forwards", async () => {
    const all: string[] = [...(await listEventIds("prj-checkout")), ...(await listEventIds("prj-notify")), ...(await listEventIds("prj-sandbox"))];
    expect(all.length).toBeGreaterThanOrEqual(28);
    expect(all.length).toBeLessThanOrEqual(32);
    const payload = await demoRequest<{ payload: string }>("GET", `/api/projects/${checkoutId}/events/${all[0]}/payload`);
    expect(() => JSON.parse(payload.payload)).not.toThrow();
    const attempts = await demoRequest<{ attempts: Array<{ success: number }> }>(
      "GET",
      `/api/projects/${checkoutId}/events/${all[0]}/attempts`
    );
    expect(attempts.attempts.length).toBeGreaterThan(0);
    const tunnels = await demoRequest<{ tunnels: unknown[] }>("GET", `/api/projects/${checkoutId}/events/${all[0]}/tunnels`);
    expect(Array.isArray(tunnels.tunnels)).toBe(true);
  });

  it("contains dead letters (latest attempt per target failed) in every shape", async () => {
    const ids = await listEventIds(checkoutId);
    const results = await Promise.all(
      ids.map(async (id) => {
        const data = await demoRequest<{ attempts: Array<{ destination_id?: string; attempt_no: number; success: number }> }>(
          "GET",
          `/api/projects/${checkoutId}/events/${id}/attempts`
        );
        const latest = new Map<string, number>();
        for (const attempt of data.attempts) {
          const key = attempt.destination_id ?? "target";
          latest.set(key, Math.max(latest.get(key) ?? 0, attempt.attempt_no));
        }
        const stuck = data.attempts.filter(
          (attempt) => attempt.success === 0 && attempt.attempt_no === (latest.get(attempt.destination_id ?? "target") ?? 0)
        );
        return stuck.length;
      })
    );
    expect(results.filter((count) => count > 0).length).toBeGreaterThanOrEqual(2);
  });

  it("replay creates a new event that lands delivered", async () => {
    const before = await listEventIds(checkoutId);
    await demoRequest("POST", `/api/projects/${checkoutId}/events/${before[before.length - 1]}/replay`);
    const after = await listEventIds(checkoutId);
    expect(after.length).toBe(before.length + 1);
    const attempts = await demoRequest<{ attempts: Array<{ success: number; attempt_no: number }> }>(
      "GET",
      `/api/projects/${checkoutId}/events/${after[0]}/attempts`
    );
    expect(attempts.attempts.at(-1)?.success).toBe(1);
  });

  it("serves metrics computed from the fixtures", async () => {
    const health = await demoRequest<{ health: { successCount: number; failedCount: number; successRate: number } }>(
      "GET",
      `/api/metrics/project/${checkoutId}/delivery-health?window=7d`
    );
    expect(health.health.successCount).toBeGreaterThan(0);
    const volume = await demoRequest<{ metrics: Array<{ project_slug: string; count: number }> }>("GET", "/api/metrics/projects-volume?window=7d");
    expect(volume.metrics.find((m) => m.project_slug === "checkout")?.count).toBeGreaterThan(0);
  });
});
