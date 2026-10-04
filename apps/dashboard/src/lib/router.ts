import { useEffect, useState } from "react";
import type { ProjectSection } from "../pages/dashboard/types";

export type RoutePlace = "events" | "dead-letters" | "project";

export type Route =
  | { place: "events"; slug: string; eventId: string | null }
  | { place: "dead-letters"; slug: string }
  | { place: "project"; slug: string; section: ProjectSection };

const SECTIONS: readonly ProjectSection[] = ["overview", "endpoints", "access", "monitoring", "tunnels"];

function parseSection(value: string | undefined): ProjectSection {
  return value && (SECTIONS as readonly string[]).includes(value) ? (value as ProjectSection) : "overview";
}

export function parseHash(hash: string): Route | null {
  const match = /^#\/p\/([^/]+)(?:\/(events|dead-letters|project)(?:\/([^/]+))?)?\/?$/.exec(hash);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]);
  const place = (match[2] ?? "events") as RoutePlace;
  const rest = match[3];
  if (place === "events") return { place: "events", slug, eventId: rest ? decodeURIComponent(rest) : null };
  if (place === "dead-letters") return { place: "dead-letters", slug };
  return { place: "project", slug, section: parseSection(rest) };
}

export function formatRoute(route: Route): string {
  const slug = encodeURIComponent(route.slug);
  if (route.place === "events") {
    return route.eventId ? `#/p/${slug}/events/${encodeURIComponent(route.eventId)}` : `#/p/${slug}/events`;
  }
  if (route.place === "dead-letters") return `#/p/${slug}/dead-letters`;
  return `#/p/${slug}/project/${route.section}`;
}

export function readRoute(): Route | null {
  if (typeof window === "undefined") return null;
  return parseHash(window.location.hash);
}

export function routeSlug(route: Route | null): string | null {
  return route?.slug ?? null;
}

/**
 * Navigate by mutating the hash. pushState is used by default so back/forward work;
 * pass { replace: true } for corrections (auto-select, unknown-slug fallback).
 * pushState does not fire hashchange, so it is dispatched manually.
 */
export function navigate(route: Route, options?: { replace?: boolean }): void {
  if (typeof window === "undefined") return;
  const hash = formatRoute(route);
  if (window.location.hash === hash) return;
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  if (options?.replace) {
    window.history.replaceState({}, "", url);
  } else {
    window.history.pushState({}, "", url);
  }
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/** Translate a legacy `?tab=…&section=…` URL into a route, before hashes existed. */
export function legacyQueryPlace(search: string): { place: RoutePlace; section: ProjectSection } | null {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  if (tab !== "project" && tab !== "keys" && tab !== "observability") return null;
  const rawSection = params.get("section");
  const section =
    rawSection && (SECTIONS as readonly string[]).includes(rawSection)
      ? (rawSection as ProjectSection)
      : tab === "keys"
        ? "access"
        : tab === "observability"
          ? "monitoring"
          : "overview";
  return { place: "project", section };
}

export function useRoute(): Route | null {
  const [route, setRoute] = useState<Route | null>(() => readRoute());
  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);
  return route;
}
