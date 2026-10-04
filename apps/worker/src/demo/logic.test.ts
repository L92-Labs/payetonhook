import { describe, expect, it } from "vitest";
import { capDemoBody, isValidDemoSlot, pushDemoEvent, type DemoEvent } from "./logic";

function fakeEvent(id: string): DemoEvent {
  return {
    id,
    method: "POST",
    path: "/in/demo/abc123",
    received_at: new Date().toISOString(),
    body: "{}",
    size: 2,
    contentType: "application/json"
  };
}

describe("isValidDemoSlot", () => {
  it("accepts 6 lowercase alphanumeric slots", () => {
    expect(isValidDemoSlot("abc123")).toBe(true);
    expect(isValidDemoSlot("zzzz99")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isValidDemoSlot("ABC123")).toBe(false);
    expect(isValidDemoSlot("abc12")).toBe(false);
    expect(isValidDemoSlot("abc1234")).toBe(false);
    expect(isValidDemoSlot("ab-123")).toBe(false);
    expect(isValidDemoSlot("")).toBe(false);
    expect(isValidDemoSlot("demo")).toBe(false);
  });
});

describe("capDemoBody", () => {
  it("passes small bodies through untouched", () => {
    const result = capDemoBody('{"type":"ping"}');
    expect(result.body).toBe('{"type":"ping"}');
    expect(result.size).toBe(15);
  });
  it("truncates oversized bodies with a marker", () => {
    const big = "x".repeat(10 * 1024);
    const result = capDemoBody(big);
    expect(result.size).toBe(10 * 1024);
    expect(result.body.length).toBeLessThan(big.length);
    expect(result.body).toContain("[truncated");
  });
});

describe("pushDemoEvent", () => {
  it("prepends newest event and caps the list at 20", () => {
    let events: DemoEvent[] = [];
    for (let i = 0; i < 25; i += 1) {
      events = pushDemoEvent(events, fakeEvent(`evt_${i}`));
    }
    expect(events).toHaveLength(20);
    expect(events[0].id).toBe("evt_24");
    expect(events[19].id).toBe("evt_5");
  });
});
