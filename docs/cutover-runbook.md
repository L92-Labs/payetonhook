# Database Cutover Runbook

This runbook supports migration from single D1 to either sharded D1 or an external relational database.

## Preconditions

- Repository layer is used by all business paths (`ProjectsRepo`, `EventsRepo`, `AttemptsRepo`).
- Every hot-path row includes tenant key (`project_id`) and time index.
- Backfill worker can copy data and verify row counts and payload pointers.

## Staged Cutover

1. `read-old-write-both`
   - Read from D1.
   - Write to D1 and new backend.
   - Monitor write error rate and consistency checks.
2. `read-new-write-both`
   - Flip reads to new backend behind a feature flag.
   - Keep dual writes for rollback safety.
3. `read-new-write-new`
   - Disable writes to D1 after consistency window is stable.
   - Keep D1 read replica snapshots for rollback.
4. `decommission-old`
   - Freeze D1 write path.
   - Archive and remove old bindings.

## Validation Checklist

- Event count parity by project and day.
- Attempt count parity by event id.
- Replay path resolves identical payload hash.
- P95 read/write latency within target SLO.
