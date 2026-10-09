# Backend capability boundaries

Snapshot 1.1.0 checks TypeScript/JavaScript, Python and Go without executing application code.
AI and object-storage SDK imports are rejected outside these reviewed adapters:

- `apps/worker/src/lib/delivery-capability.ts`

Worker binding names: `EVENT_BLOB`. Named reads, destructuring and computed environment aliases are checked.

Existing backend debt: 2 findings. Each entry pins the whole source hash; new files and edited bypasses fail CI. Existing UI debt hashes were preserved. Approved adapters own provider I/O; business code calls their capabilities. This is a syntax boundary, not a proof against arbitrary reflection or an SQL transaction verifier.

Run `node .agent-platform/policy/check.mjs` with the pinned TypeScript compiler available. Do not refresh the debt baseline to admit new violations. Update approved paths through code review.
