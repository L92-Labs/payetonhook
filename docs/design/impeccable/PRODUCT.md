# Product

<!-- impeccable:product-schema 1 -->

> Provenance: written during the Impeccable dashboard redesign proposition for Payetonhook.
> No structured interview channel was available in this unattended session, so every fact
> below is **inferred** from the repository (`README.md`, `apps/worker` API surface, the
> dashboard source in `apps/dashboard/src`) unless tagged *(brief)* for facts that come from
> the redesign brief itself. Confirm or correct before treating this as settled product truth.

## Platform

web (React 19 + Vite dashboard at `apps/dashboard`, plain CSS, no Tailwind). The Worker API
(`apps/worker`) and the local tunnel CLI (`apps/cli`, `relay`) are siblings, not surfaces
here; the dashboard is the only screen in scope for this proposition.

## Users

*(inferred from README capability list and dashboard data model)*

- **Developers integrating webhooks** who point a provider (payments, git hosting, CI) at a
  durable ingress URL and need to see exactly what arrived, when, and with what payload.
- **Developers debugging delivery** who fan out to endpoints, watch retry ladders, inspect
  status codes and error messages, and replay events after fixing the receiver.
- **Developers working locally** who run `relay tunnel` to forward production webhooks to a
  local dev server and check tunnel health and forward outcomes from the dashboard.

The common scene: a webhook misbehaves (or a receiver does). The developer opens the
dashboard mid-thought, finds the event in a live stream, inspects payload and attempts, and
either fixes the receiver and replays, or clears the dead letter. Sessions are short,
keyboard-driven, and often at night.

## Product Purpose

Payetonhook is a self-hostable webhook relay and testing platform: durable ingestion,
fan-out delivery with retry semantics, replay, dead-letter triage, and a local development
tunnel. The dashboard's job is event and dead-letter visibility — success is a developer
going from "something ate my webhook" to "attempt 2 returned 502, here is the payload,
replayed, now 204" in under a minute.

## Positioning

*(inferred)* An instrument, not a control tower: self-hosted, single-purpose, terminal-
adjacent. Where hosted webhook consoles sell dashboards with graphs-first chrome, Payetonhook
sells the ledger — every event durable, inspectable, replayable — with graphs as a supporting
scan, not the front page.

## Operating Context

- Two views *(from code)*: **Events** (triage: stream + detail) and **Project** (settings,
  endpoints, access keys, monitoring, tunnels).
- Machine data dominates: event ids, endpoint paths, HTTP methods, status codes, timestamps,
  JSON payloads, key fingerprints. Human text is secondary.
- Keyboard-first triage already exists *(from code)*: `/` search, `J/K` event navigation,
  `R` replay. Density and timezone toggles, auto-refresh.
- Google login gate; CSRF-token API on a Cookie session.

## Capabilities and Constraints

- Event stream with cursor pagination; detail shows payload (or URL params for GET),
  delivery attempts with ok/ko outcomes and error text, and tunnel forwards.
- Replay creates a replay-flagged event; dead letters surface as failed attempt counts.
- Projects, endpoints, API keys (create/rotate/revoke), tunnels (live/idle/stale, expand
  for device/source details, disconnect).
- Constraint for this proposition *(brief)*: no API, business-logic or data-flow changes;
  visual, layout, typography, copy and component-structure changes only; no feature removal.
  One addition allowed *(brief)*: a strictly env-gated `VITE_DEMO=1` fixture mode in
  `src/lib/api.ts` for previewing the proposition without a backend.

## Brand Commitments

- Name: **Payetonhook**. No logo raster, no locked brand palette *(inferred — none in
  repo)*; free rein on palette per the brief, one accent to bind it.
- Voice *(inferred)*: terse, technical, honest. Log-line copy, not marketing copy.

## Evidence on Hand

- No testimonials, usage metrics or customer evidence exist in the repo; none may be invented.
- Demo screenshots and fixtures in this proposition are synthetic, authored for capture, and
  gated behind `VITE_DEMO=1` with `DEMO-ONLY` markers.

## Product Principles

1. The event is the unit of work; every screen serves finding, trusting, and acting on one.
2. Machine data is first-class: mono-set, tabular, never reflowed by decoration.
3. State changes restyle in place — a retry, replay or failure never reflows the ledger.
4. Colour is a signal lamp, not paint: amber for attention/active, green/red for outcomes.
5. Quiet by default: no motion competing with the stream, no counters begging clicks.

## Accessibility & Inclusion

WCAG 2.1 AA as the floor: contrast on the committed dark palette, visible keyboard focus on
every interactive element (the app is keyboard-first), reduced-motion respected for reveals
and skeleton shimmer, and honest density controls for legibility.
