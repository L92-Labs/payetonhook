# Payetonhook dashboard: Taste Skill audit (proposition "Phosphor instrument")

> **Current mode: re-skin / visual pass ON the Layers redesign.** The audit below was
> originally performed against the pre-Layers main (branch `design/taste`). It is now
> applied on top of the merged Layers redesign (`origin/main`): the hash router with
> addressable places (`#/p/<slug>/events[/<eventId>]`, `/dead-letters`,
> `/project/<section>`), `DeadLetterView`, the quiet graphite surface, and the
> `VITE_DEMO` fixture mode all stay from Layers — structure, behavior, routes, markup
> and tests are Layers'. This branch replaces only the visual language: the
> phosphor-instrument token set, IBM Plex type planes, radius lock, LED/well/chip
> patterns, and motion rules described below. See the reconciliation addendum at the
> end for what the reskin changed in Layers-only surfaces.

Audit performed before any visual change, following the Taste Skill method (tasteskill.dev):
Scan, Diagnose, Fix, plus section 11 (Redesign Protocol). Original base: pre-Layers
`origin/main` of `L92-Labs/payetonhook` (branch `design/taste`); reskin base:
post-Layers `origin/main` (branch `design/taste-on-layers`).

## Design read

> Reading this as: **redesign (overhaul of visuals, preserve IA and content)** of a
> **self-hosted webhook relay / testing platform** for **developers who triage delivery
> failures fast** (keyboard-first: `/`, `J/K`, `R`), with a **dark "phosphor instrument"
> language**: near-black green-cast ground, one phosphor-green signal, amber warn,
> red alert, **IBM Plex Mono as the data plane + IBM Plex Sans as the prose plane**,
> hairline structure, near-square edges, zero shadows, LED dots for live state.

Taste section 13 notes that dense product UI is outside the skill's sweet spot. As the
pocketmind audit does, we apply the skill's anti-slop rules, token discipline, dark-mode
protocol, motion rules and pre-flight check to **all** product surfaces (triage stream,
detail inspector, resource tables, monitoring), and its hero/auth rules to the two
full-bleed surfaces where they apply (auth gate, session-restore shell).

## Mode detection (Taste 11.A)

**Redesign, overhaul** (original pass) → **re-skin / visual pass** (this branch, on
Layers). IA, routes — now hash-router places instead of the original `?tab=` params —
nav labels, copy voice, keyboard shortcuts, form fields and API contract stay exactly
as Layers shipped them. Visual language (tokens, type, surfaces, motion, component
skins) is replaced. Brand assets kept: the "Payetonhook" name, all copy that carries
meaning. Retired by this pass: the Layers "quiet graphite" token set (system type,
desaturated graphite palette, shadow stack, 0.75–1.75rem radii).

## Stack scan

| Item | Finding |
|---|---|
| App | Vite 7 + React 19, single entry `src/main.tsx`, no router lib (URL params by hand) |
| Styling | **Plain CSS, no Tailwind** — one `src/styles.css` (2,645 lines), CSS variables in `:root`, hardcoded rgba/hex values bypass tokens in ~40 places |
| Components | Hand-rolled function components in `src/pages/dashboard/*` (no UI kit, no Radix) |
| Icons | `lucide-react` (3 icons only: Copy, Pencil, Trash2) |
| Motion | reveal classes currently `animation: none` (disabled); `.flow-packet` sets `animationDelay` but **no keyframes exist** (dead motion) |
| Theme | Single dark theme, `color-scheme: dark`, no theme switch |
| Fonts | Google import: Bricolage Grotesque + Newsreader (serif headlines on an ops tool) |
| API | `src/lib/api.ts` → `https://api.payetonhook.l92-labs.com`, cookie + CSRF |

## Dial reading of the existing app (Taste 11.B)

| Dial | Existing | Evidence |
|---|---|---|
| DESIGN_VARIANCE | 3 | navy+teal rounded-card dashboard, serif display headline, 0.75–1.75rem radii everywhere |
| MOTION_INTENSITY | 2 | reveals disabled, no transitions on most controls, dead flow-packet animation |
| VISUAL_DENSITY | 5 | good list density, but pill badges + heavy card padding dilute the data plane |

## Chosen dials (recorded)

| Dial | Value | Why |
|---|---|---|
| `DESIGN_VARIANCE` | **6** | Overhaul = +2 over a generic 3. Commit to one idea (ops instrument): mono data plane, hairlines, LEDs, sunken readout wells. Product surfaces stay grid-true; muscle memory preserved. |
| `MOTION_INTENSITY` | **3** | Instrument, not toy: 120–180ms color/border/transform transitions, 160ms staggered reveal, LED pulse and packet sweep **only** for real live state (tunnels). Everything collapses under `prefers-reduced-motion`. |
| `VISUAL_DENSITY` | **6** | +1 over existing: hairline row separation instead of card-in-card boxes where elevation is not hierarchy, tabular mono numerals, uppercase micro labels at 10.5–11px. |

## Brand tokens found

| Token | Value | Verdict |
|---|---|---|
| `--bg` | `#0b1117` navy-black | Reads "default dark dashboard". Replace with neutral green-cast black. |
| `--accent` | `#63d5c1` teal | Second-most-common AI accent after purple. Replace with one phosphor green. |
| `--panel/--surface` family | navy steps `#111923/#151f2b/…` | Blue-tinted steps → replace with green-cast ink steps. |
| `--shadow` | `0 18px 42px rgba(0,0,0,.22)` on every panel | Shadow stack on flat UI. Retire: elevation = hairline + surface step. |
| Radius | `0.75rem`–`1.75rem`, pills `999px` on badges/tabs/status | Mixed, undocumented (Shape Consistency Lock fail). Replace with 2/4/6/8 lock. |
| Type | Bricolage Grotesque (UI) + Newsreader (serif h1) | Serif display on a delivery console is costume, not instrument. Replace with IBM Plex Mono (data) + IBM Plex Sans (prose). |
| Hardcoded colors | `#0b121a`, `#121c27`, `#0d151f`, `#6f8198`, `#9caac0`, `#ffd9df`, `#b5f3ef`, `rgba(255,255,255,.02–.08)`, `rgba(99,213,193,…)` | Bypass tokens. Token-ize all of them this pass. |

## Information architecture (preserved, not changed)

- `?tab=events` → project summary strip + view toolbar (search, refresh, auto-refresh,
  filters: replays-only, density, timezone, from/to) + triage layout (event stream /
  event detail: payload or URL params, delivery attempts, tunnel forwarding, replay).
- `?tab=project&section=overview|endpoints|access|monitoring|tunnels` → project shell
  (context cards, section tabs) + per-section utility panels.
- Keyboard: `/` focus search, `J/K` next/prev event, `R` replay.
- Google login gate + session-restore shell.

## Patterns to preserve

- Two-view split (events triage vs project workspace) and URL param routing.
- Sticky events panel, load-more pagination, compact density toggle.
- Copy affordances everywhere (ingress URL, event id, fingerprints, tunnel ids).
- Tunnel connection flow diagram (LOCAL → line → CLOUD) and CLI hint.
- Copy voice: short, functional, lowercase-friendly. Keyboard hints in toolbar note.

## Diagnosis: patterns to retire

### Typography
- Serif display headline + grotesque UI on an ops console: display costume.
- Monospace only on `code/pre`; event ids, timestamps, status codes, metrics — the
  actual data plane — render in proportional grotesque without tabular alignment.
- Uppercase micro labels at `0.72–0.76rem` grotesque 600: no letter-spacing, no mono.

### Color and surfaces
- Navy + teal = generic dark-dashboard palette; teal used as both brand and success.
- `--warn` (`#eecb7d`) doubles as the "code/URL" color (`--warn` on every `code`):
  semantic collision — URLs are not warnings.
- Big soft shadow on every panel; card-in-card-in-card nesting for the same elevation.
- Pill badges (`999px`) on every chip/status; radius jumps 0.75→1.75rem between
  adjacent surfaces.
- ~40 hardcoded rgba/hex values bypass the token system.

### Motion
- `reveal-*` classes exist but are pinned to `animation: none`.
- `.flow-packet` sets `animationDelay` inline; no `@keyframes` exists — dead code.
- No `prefers-reduced-motion` guard anywhere.

### Components
- Tabs/segmented controls/buttons all share one rounded pill skin: no hierarchy
  between nav (Events/Project), section tabs, and window presets.
- Toggle pills are labeled checkboxes ("Auto refresh off") — keep behavior, reskin.
- Skeleton rows are static gray blocks; no loading cadence.
- Empty states: dashed rounded box + centered text — fine bones, generic skin.

## Fix plan (redesign fix priority order)

1. **Font swap:** IBM Plex Mono (data plane: ids, timestamps, codes, metrics, nav,
   buttons, inputs, chips, tables) + IBM Plex Sans (prose plane: subtitles, summaries,
   empty-state body). Google Fonts import, `font-variant-numeric: tabular-nums`
   wherever numbers live.
2. **Palette:** green-cast ink neutrals + one phosphor green signal (`#5fdb8f`),
   amber warn, warm red danger, all semantic-only. URLs/code move off `--warn` onto a
   dedicated `--code` tint. Every hardcoded color becomes a token.
3. **Shape Consistency Lock:** 2px chips, 4px controls, 6px surfaces, 8px overlays;
   zero pills; LED dots + uppercase mono text replace status pills.
4. **Surfaces:** shadow token → `none`; elevation by hairline + surface step; sunken
   wells (`--surface-sunken`) for payload readouts, charts, flow nodes.
5. **Component skins:** nav tabs (underline rail), section tabs, seg control, buttons
   (square, press = 1px settle), inputs (sunken well, accent focus), tables (hairline
   rows, mono header row), chips (bordered, tinted), badges, toggle pills, disclosures,
   modal, toast, skeletons, empty states.
6. **Motion:** 120–180ms transitions (color/border/transform only), 160ms staggered
   reveal, LED pulse + packet sweep for live tunnels only, `prefers-reduced-motion`
   kill-switch. Nothing exceeds 200ms. CSS-only.
7. **Polish:** thin dark scrollbars, accent selection, auth shell gets mono wordmark
   with block cursor (single decorative gesture, also the only one).

## Radius rule (Shape Consistency Lock)

| Element | Radius |
|---|---|
| Chips, badges, LEDs, kbd-like bits | 2px |
| Controls: buttons, inputs, selects, tabs, seg, toggles | 4px |
| Surfaces: panels, tables, lists, metric cards, disclosures | 6px |
| Overlays: modal card | 8px |
| Pills (`999px`) | none remain |

## Token discipline plan

- One `:root` block is the single source: color, surface, line, radius, font, motion,
  focus tokens. No hex/rgba outside it (chart SVG consumes `var(--accent)`).
- Shadows: `--shadow: none` (kept as a token so the contract "elevation is hairline"
  is explicit).
- Charts read `currentColor` from CSS classes only.

## Dark-mode protocol

- Product is dark-only (ops instrument, documented decision); `color-scheme: dark`.
- Ground is near-black with a green cast so the phosphor accent stays in-family;
  contrast: ink `#e6efe2` on `#090b09` ≈ 15:1, muted `#8a9787` on ground ≈ 5.4:1,
  accent `#5fdb8f` on ground ≈ 9:1 — all ≥ WCAG AA for their roles.
- No pure `#fff`/`#000` anywhere; no translucent-over-content fills except the modal
  backdrop (opaque enough to not fight the dialog).

## Motion rules

- Budget: ≤200ms per interaction; transitions animate `color`, `border-color`,
  `background-color`, `transform`, `opacity` only.
- Live state only may loop: LED pulse (opacity), packet sweep (transform/position).
  No hover loops, no floating, no bounce, no parallax.
- `@media (prefers-reduced-motion: reduce)`: all animations/transitions off.

## Anti-slop checklist

- [x] No gradient buttons/banners/backgrounds (zero `linear-gradient` decorations)
- [x] No glassmorphism / `backdrop-blur`
- [x] No decorative blobs, mesh, glow stacks
- [x] No default blue/purple; no teal
- [x] No shadow stacks; hairline elevation
- [x] Every color/radius/font/duration from tokens
- [x] No emoji, no stock illustrations, no invented testimonials
- [x] Lucide kept (3 functional icons) — no icon-family churn for churn's sake
- [x] One idea, committed: instrument panel, not landing-page cosplay

## Pre-flight check

- [x] No layout/IA/copy changes; selectors preserved; class contract with TSX unchanged
- [x] Responsive blocks preserved (1240/1160/980/860 breakpoints)
- [x] Accessibility kept: skip link, focus-visible rings (accent, 2px), aria labels,
  `role=tablist` semantics, keyboard shortcuts untouched
- [x] Reduced-motion guard added
- [x] `VITE_DEMO=1` fixtures (3 projects, ~30 events, dead letters, endpoints, tunnels)
      strictly env-gated in `src/lib/api.ts`; Google login path untouched otherwise

## Out of scope

No `wrangler`, no deploys, no secrets, no backend/API changes, no main-branch writes.

## Addendum — reskin on Layers (branch `design/taste-on-layers`)

What changed in this pass, on top of the merged Layers structure:

- `apps/dashboard/src/styles.css` is replaced wholesale by the phosphor-instrument
  skin (tokens, IBM Plex Mono/Sans via Google Fonts, 2/4/6/8px radius lock,
  `--shadow: none`, LED dots, sunken readout wells, bordered square chips, mono
  uppercase micro labels, `--code` token for URLs/code, 120–180ms CSS-only motion,
  staggered `reveal-*`, `prefers-reduced-motion` kill-switch). Layers' graphite
  token set, serif reading font and shadow stack are retired.
- Selector reconciliation: every class the Layers tsx emits keeps a rule. The
  class vocabularies already overlapped almost completely (the original taste pass
  never touched tsx). Layers-only selectors — `dlq-table-grid`, `dlq-scope-note`,
  `dlq-failures`, `dlq-failure`, `dlq-endpoint`, `dlq-age`, `section-status-link`,
  `status-text`, `tunnel-empty-visual` — are added at the bottom of the sheet in the
  same visual language (hairline table rows, mono tabular numerals, danger-tinted
  failure codes, mobile collapse with `::before` column labels at 860px, matching
  the existing endpoint/access table pattern).
- Layers-new surfaces wearing the skin: the dead-letters place is a hairline
  `resource-table` with sunken failure readouts; the event-detail "N failed · view
  dead letters" escape hatch is a `section-status.danger` underline link; nav now
  carries three places (Events / Dead letters / Project) on the phosphor underline
  rail; keyboard hints stay mono.
- tsx touches are visual-only: `Charts.tsx` line-chart SVG fallback color
  `#9db8ae → #5fdb8f`. No behavior, route, test, api, or demo changes: Layers'
  `VITE_DEMO` mode, fixtures, router and its ~12 tests are kept verbatim; the taste
  branch's own `api.ts`/`demo.ts` were NOT reintroduced.
- Google login flow untouched; pre-flight items above continue to hold on the
  Layers markup.
