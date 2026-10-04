# Surface brief: Payetonhook dashboard (apps/dashboard)

Scope: the whole authenticated app (Events triage + Project workspace), the Google login
gate, and system states (loading, empty, error). One mode: **Operate** — this is a bench,
not a reading room.

## Direction contract

THESIS: The dashboard is a relay bench, not a generic dark SaaS console. It refuses the
category default — blue/cyan-accented admin panel of equal cards, gradient charts and badge
noise. A disciplined ledger of machine events does the work; one signal amber marks what is
active or needs eyes.

OWN-WORLD: Warm ink-black ground (`#0e1116` family) with two surface layers — bench panel
and inset well — separated by hairlines, 8px radii, shadows with real offset, no gradients,
no glass. Signal amber (OKLCH ~75/0.13/75) is the single accent, reserved for selection,
primary action, active tab, and focus. Newsreader (serif) carries display: the wordmark,
panel titles, project names. Bricolage Grotesk carries interface copy. JetBrains Mono sets
every machine value — event ids, endpoint paths, methods, status codes, timestamps, counts,
payloads — in tabular figures, right-aligned where they read as folios. Green and soft
vermilion exist only as delivery outcomes (ok/ko); gold doubles as the warn lamp only
inside counters that beg a look (429s, throttled).

STORY: A developer wiring a payment provider opens the bench, reads the live relay log
ruled like a station ledger, picks an event with `J/K`, inspects the payload in a mono well,
follows the attempt ladder (ok/ko, codes, error text), hits the one amber Replay, and moves
on. Dead letters announce themselves in place, never reflowing the stream.

FIRST VIEWPORT: Sticky bench rail (wordmark, project scope, Events/Project tabs, user) →
project strip with the ingress URL as a copyable mono artifact → filter toolbar (search,
refresh, auto-refresh, disclosure filters) → split triage: the sticky ledger left, the
inspection card right.

FORM: Relay ledger (the grounded list of this build). Signature move: each event is a
station-log line — hairline-ruled, mono event id, method chip, Live/Replay lamp, relative
time right-aligned in tabular figures with the absolute stamp underneath; the selected row
carries a 2px amber marker on its ruling edge and an amber-soft wash that never shifts
layout. Compact density tightens leading, not information.

Raises borrowed from declined challengers (one world owns the page; disciplines only):

- From the split-flap board: attempt outcomes, replay flags and failures restyle the row in
  place; nothing reflows the ledger.
- From the orienteering map: amber marks the active leg only — selection, current tab,
  primary action. Never decoration, never a second hue.
- From the monochrome product canon: empty states show the real action (reset filters,
  create key, the `relay tunnel` command to copy), not claims.
- From the convention catalogue: table density stays honest — compact shows more rows by
  tightening rhythm, not by hiding columns.
- From the cassette j-card: timestamps, codes and counts sit right-aligned, tabular,
  folio-style.
- From the midnight transit mural: the dark palette is committed and warm, not an inversion
  of a light theme; `color-scheme: dark` is the only theme.

FINISH: unreviewed and undocumented is unfinished. This build ends with detector before/
after artifacts in `.impeccable/`, findings resolved or justified in the PR, and the DEMO
preview (`VITE_DEMO=1`) carrying `DEMO-ONLY` markers so synthetic data can never pose as
production evidence.

## Type contract

- Newsreader 500/600: wordmark, `h1`/`h2` display, project names, dialog titles.
- Bricolage Grotesque 400–700: interface copy, buttons, labels.
- JetBrains Mono 400–700: all machine data, tabular-nums on every numeric column.
- Micro-labels: 0.68rem, 0.08em tracking, uppercase, muted — one system, no orphan sizes.

## State contract

Every interactive element ships hover, active, focus-visible (amber ring) and disabled
(opacity + no-allowed) together. Loading = skeleton pulse in the ledger rows and detail
ladder, never spinner chrome over content. Errors render as a ruled banner beside the
action they block, with a Retry action. Empty states name the next real move.

## Unresolved decisions

- Light theme: out of scope for this proposition; the bench is committed dark.
- Brand raster: none exists; a wordmark-led identity is proposed, owner may commission art.
- The tunnel flow diagram (LOCAL → CLOUD) keeps its animated packet, slowed and
  reduced-motion-guarded; removing it would delete real status semantics.
