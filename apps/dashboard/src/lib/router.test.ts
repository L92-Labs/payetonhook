import { describe, expect, it } from "vitest";
import { formatRoute, legacyQueryPlace, parseHash } from "./router";

describe("parseHash", () => {
  it("parses the events place without an event", () => {
    expect(parseHash("#/p/checkout/events")).toEqual({ place: "events", slug: "checkout", eventId: null });
  });

  it("parses a deep-linked event", () => {
    expect(parseHash("#/p/checkout/events/evt-123")).toEqual({ place: "events", slug: "checkout", eventId: "evt-123" });
  });

  it("parses dead letters and project sections", () => {
    expect(parseHash("#/p/notifications/dead-letters")).toEqual({ place: "dead-letters", slug: "notifications" });
    expect(parseHash("#/p/checkout/project/endpoints")).toEqual({ place: "project", slug: "checkout", section: "endpoints" });
    expect(parseHash("#/p/checkout/project")).toEqual({ place: "project", slug: "checkout", section: "overview" });
  });

  it("defaults a bare project hash to events and rejects junk", () => {
    expect(parseHash("#/p/checkout")).toEqual({ place: "events", slug: "checkout", eventId: null });
    expect(parseHash("")).toBeNull();
    expect(parseHash("#/other/x")).toBeNull();
  });

  it("round-trips through formatRoute", () => {
    const cases = [
      { place: "events", slug: "checkout", eventId: null },
      { place: "events", slug: "checkout", eventId: "evt-1" },
      { place: "dead-letters", slug: "sandbox" },
      { place: "project", slug: "notifications", section: "access" }
    ] as const;
    for (const route of cases) {
      expect(parseHash(formatRoute(route))).toEqual(route);
    }
  });
});

describe("legacyQueryPlace", () => {
  it("translates legacy tab queries", () => {
    expect(legacyQueryPlace("?tab=project&section=tunnels")).toEqual({ place: "project", section: "tunnels" });
    expect(legacyQueryPlace("?tab=keys")).toEqual({ place: "project", section: "access" });
    expect(legacyQueryPlace("?tab=observability")).toEqual({ place: "project", section: "monitoring" });
  });

  it("ignores events and unknown tabs", () => {
    expect(legacyQueryPlace("?tab=events")).toBeNull();
    expect(legacyQueryPlace("")).toBeNull();
  });
});
