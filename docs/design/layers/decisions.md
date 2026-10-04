# Decision map

Every decision, its layer, the problem it solves (findings from `00-orient.md`),
confidence, and where it is implemented. Confidence: **A** = assumption, untested ·
**I** = inferred from product evidence · **P** = forced by product facts (code/DB/API).

| # | Decision | Layer | Solves | Conf. | Implemented in |
|---|---|---|---|---|---|
| D1 | **Dead letter is a first-class derived object**: latest attempt per forward target failed ⇒ event is dead-lettered; gets its own place | Model | failure invisible without clicking events | P (semantics), I (priority) | `DeadLetterView.tsx`, derivation in `DashboardApp.tsx` |
| D2 | **Rename the masking**: public route = *endpoint* (kept); DB `destinations` = *forward rule* (docs only, provisional UI) | Model | "endpoint" names two objects | I | `05-conceptual-model.md` |
| D3 | **Honest delivery states**: Pending → Retrying → Delivered/Dead; Delivered shows nothing; Dead = red | Model | outcome not a property of the event row | P | event row dots, dead-letter rows |
| D4 | **Addressed places** `#/p/:slug/events[/:eventId]`, `#/p/:slug/dead-letters`, `#/p/:slug/project/:section`; hash routing, no router dep; legacy `?tab=` translated | Flow | no per-project/event URL, back exits, DLQ homeless | P | `src/lib/router.ts`, `DashboardApp.tsx` |
| D5 | **Project switch preserves place** (navigates to same place under new slug) | Flow | switching silently mutates view | I | toolbar select in `DashboardApp.tsx` |
| D6 | **Dead-letter scan is client-side, bounded (newest ~25 events), cached per event** | Flow | no worker list endpoint exists | P (constraint), I (bound) | `DashboardApp.tsx` |
| D7 | **Quiet graphite tokens**: desaturated palette, single accent role, borders over shadows, no webfont fetch | Surface | loud teal console | A | `styles.css` |
| D8 | **Mono for data, tabular numerals**; system sans for chrome | Surface | inspectability | A | `styles.css` |
| D9 | **Motion ≤200ms, transform/opacity only, CSS-only; reduced-motion honoured** | Surface | calm, a11y | P (brief) | `styles.css` |
| D10 | **VITE_DEMO=1 fixture mode**: same `api.ts` surface, in-memory store, auth gate bypassed; strictly env-gated, DEMO-ONLY | Tooling | design review without a live worker | P | `src/lib/demo.ts` + `src/lib/api.ts` |

## Deferred / provisional (need worker or research)
- **Worker-side failed-events endpoint** — would replace D6's client scan, enable a
  toolbar dead-letter count badge, and cover failures older than the newest page.
- **Forward rules UI** (destinations with conditions/transforms/retry budgets) — real
  object, currently invisible; needs product intent first.
- **Filters in the URL** (query, time range) — only if sharing filtered views is asked for.
- **Light theme** — tokens are ready for it; no evidence of demand.

## Assumptions to validate with real users
1. Triagers go to a failure queue first, not the stream (D1). *Watch place entry points.*
2. Sharing an event URL is common enough to justify the deep link (D4). *Ask in support
   channels how evidence is exchanged today.*
3. The client-side scan window (newest ~25 events) covers real triage depth (D6).
   *Check how far back users page today.*
4. The quiet surface reads as "trustworthy" not "unfinished" (D7). *5-second test.*
