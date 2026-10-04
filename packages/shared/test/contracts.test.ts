import { describe, expect, it } from "vitest";
import { stableShardForProject } from "../src/contracts";

describe("stableShardForProject", () => {
  it("is deterministic for same input", () => {
    const a = stableShardForProject("proj_abc", 8);
    const b = stableShardForProject("proj_abc", 8);
    expect(a).toBe(b);
  });

  it("stays within shard range", () => {
    const shard = stableShardForProject("proj_xyz", 3);
    expect(shard).toBeGreaterThanOrEqual(0);
    expect(shard).toBeLessThan(3);
  });
});
