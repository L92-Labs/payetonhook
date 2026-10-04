# 07 — Surface

Medium: responsive web, dark-only (current), desktop-first. The surface sits on the
model (05) and places (06). It is quiet on purpose: this is an operations console —
the emotional job is *"the relay is under control; failures surface themselves."*
Calm here is not aesthetic preference, it is signal-to-noise.

## Surface decisions

| Decision | Choice | Serves |
|---|---|---|
| Palette | Quiet graphite: desaturated near-black ground (`#101418`), one low-chroma sage accent for *current place + primary action*; semantic colours (success/danger/warn) desaturated to sit inside the theme | J2, calm |
| Colour carries meaning only | accent = here/primary; red = dead/failed; amber = replay/lineage. Neutral chips for method/labels — no colour for identity | dead-letter visibility |
| Typography | System sans for chrome (drop the 2-webfont Google import); **monospace for data**: ids, slugs, paths, URLs, codes, timestamps, counters (`tabular-nums`) | inspectability, speed |
| Status | **Delivered shows nothing.** Retrying = quiet neutral row; Dead = red dot + error text. Dead letters get their own place, not a badge on everything | 05 states |
| Elevation | 1px borders do the work; shadows lowered from `0 18px 42px` to a low two-step; no glows, no gradients | calm |
| Motion | CSS-only, ≤200ms, transform/opacity (+ colour transitions); `prefers-reduced-motion` honoured | a11y, calm |
| Density | Compact rows, right-sized radii (large shells 1rem, chips/buttons 0.5–0.75rem); uppercase eyebrows demoted to muted labels | data density |

## Audit (surface-fix vs deeper-layer)

| Finding | Type | Resolution |
|---|---|---|
| Failure invisible in the stream (must click each event) | **deeper (model + flow)** | Dead letters place + state derivation (05/06) |
| "Where am I" unclear after project switch | **deeper (flow)** | addressed places; project in the URL |
| Back button exits the app | **deeper (flow)** | pushState hash routing |
| Teal accent on eyebrows, focus rings, selection, chips, pulse dots | surface | colour = meaning only; single accent role |
| Display webfont (Bricolage) + serif (Newsreader) fetched for a console | surface | system stacks, zero network fonts |
| Heavy drop shadows / glow focus rings | surface | borders + low shadow, visible focus ring |
| `tunnel-pulse` dot on every card header | surface | status colour only, no persistent animation |

## Accessibility decisions
- Focus rings: 2px solid accent with offset, visible on all interactive elements.
- Place tabs keep `role="tablist"` / `aria-selected`; dead-letter rows are links with
  meaningful text (event id + endpoint).
- Timestamps and counters use tabular numerals; colour is never the only signal
  (dots are paired with text labels).
- `@media (prefers-reduced-motion: reduce)`: transitions and animations disabled.

## Still open
- Light theme (not in scope; tokens are prefixed for it).
- Forward rules as a visible object would need its own surface treatment (provisional, 05).
