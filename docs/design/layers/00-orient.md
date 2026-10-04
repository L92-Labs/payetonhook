# 00 — Orient: where the decisions are missing

Proposition for the Payetonhook dashboard, worked with **Layers of Product Design**
(layers.jamiemill.com). The brief: fix the decisions *underneath* the screens
(conceptual model, interaction structure), then express them in a calm surface.

> **Evidence caveat.** No user research, interviews, analytics or support tickets were
> available. Problem-space layers are built from the product itself: the dashboard code
> (`apps/dashboard/src`), the worker routes (`apps/worker/src/routes/api.ts`), the D1
> schema (`apps/worker/migrations/`), the delivery workflow (`workflows/delivery.ts`),
> the CLI (`apps/cli/src`) and `README.md`. Every claim is tagged
> **observed-in-product** (verifiable in code), **inferred** (reasonable read of the
> evidence) or **assumed**. Nothing here is observed user behaviour in the research
> sense. Payetonhook is a small product; layers 1–4 are compressed into this file
> rather than given one document each.

## Layer audit

| Layer | State | Notes |
|---|---|---|
| Observed behaviour | **Weak** | No research, no analytics. Only product artefacts. |
| Domain | Partial | Clear core (relay → durable events → fan-out delivery → retry/replay → tunnel). README is the de-facto domain doc. |
| User needs | Inferred | Two users visible in the code: the **integration triager** ("did my webhook arrive and land?") and the **local developer** (tunnel: "send prod webhooks to my laptop"). |
| Product strategy | Partial | Self-hosted webhook relay/testing platform; trust and inspectability are the visible bets (signing secrets, immutable events, replay). |
| **Conceptual model** | **Weak** | "Endpoint" masks two objects (public ingress route vs forwarding destination); dead-letters are not an object — a per-event derivation you can only see one event at a time; delivery state vocabulary is implicit (Delivered/Failed chips only). |
| **Interaction structure** | **Weak — bottleneck** | One route holds everything; the URL is written with `replaceState` (back exits the app); the selected **project**, **event**, and view are local state with no address; no dead-letter place; project switching silently discards context. |
| Surface | Partial | Consistent dark theme and type scale, but loud: saturated teal accent everywhere, glow-y focus rings, display webfont import, `42px`-drop shadows, uppercase eyebrows on every panel. |

**Bottleneck: interaction structure**, sitting directly on a conceptual-model gap.
The surface problems a visual pass would chase (busy toolbar, unclear "where am I",
failure invisible until you click an event) are symptoms of places without addresses
and a dead-letter concept without a home. Most effort therefore goes to layers 5–6;
the surface pass is deliberately quiet.

## Compressed problem space (layers 1–4)

- **Jobs (inferred):** J1 wire a webhook in and confirm it lands; J2 triage a failed
  delivery and replay it; J3 inspect exactly what was received (payload, headers,
  query); J4 develop locally against production traffic (tunnel); J5 administer
  projects/keys/endpoints.
- **Strategy note (inferred):** the product's promise is *you can see and replay
  everything*. Deep-linkable evidence (a URL that points at one event) is the
  operational currency of webhook debugging — today the dashboard cannot produce one.
- **Domain frictions (observed-in-product):** "endpoint" is used for
  `project_endpoints` (public routes) in the UI while `destinations` (forwarding
  rules) are invisible; "dead-letter" appears in the README but not in the UI.

## Files

1. `05-conceptual-model.md` — objects, states, ubiquitous language (current vs proposed)
2. `06-interaction-flow.md` — places and navigation (current vs proposed)
3. `07-surface.md` — quiet surface decisions
4. `decisions.md` — the decision map
