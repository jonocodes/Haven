# Haven Sync and Conflict Strategy (MVP)

## Purpose

Define the MVP sync/conflict behavior with a CRDT-preferred path and a deterministic fallback so reliability goals can be met on schedule.

## Strategy summary

- Primary path: CRDT-based convergence for supported field types and operations.
- Fallback path: deterministic last-writer-wins (LWW) rules where CRDT coverage is unavailable or too risky within timeline.
- Reliability-first rule: no acknowledged write loss; deterministic post-reconnect convergence.

## Conflict model

### CRDT target scope (MVP)

Apply CRDT semantics to high-frequency collaborative fields where feasible:

- `note.body`: text-oriented merge strategy (CRDT text data type where implementation allows).
- `note.title`: register-style CRDT or deterministic LWW fallback.
- metadata fields (`updatedAt`, `deleted`): deterministic policy, not free-form merge.

### Deterministic fallback rules

When CRDT is not applied, use these canonical rules:

1. Compare logical timestamp/version.
2. If tie, compare stable source ID lexicographically.
3. If still tied, prefer event with higher monotonic local sequence number.

All clients must apply the same ordering rules to guarantee convergence.

## Offline queue semantics

1. Every mutation receives:
   - `opId` (globally unique)
   - `entityId`
   - `baseVersion`
   - `clientTimestamp`
2. Queue ordering is append-only per client session.
3. Push retries must be idempotent by `opId`.
4. Transient failures use exponential backoff with jitter.
5. Permanent failures are quarantined with operator-visible diagnostics.

## Reconnection behavior

On reconnect:

1. `pull(cursor)` first to ingest remote changes.
2. Rebase local queued operations onto latest known state.
3. `push(batch)` pending operations with idempotency keys.
4. Apply acknowledgements and advance local cursor.
5. Emit convergence-complete event when queue drains and pull frontier catches up.

## Observability events (required)

Emit structured events at minimum:

- `sync.pull.started`
- `sync.pull.completed`
- `sync.push.started`
- `sync.push.completed`
- `sync.push.retry`
- `sync.push.quarantined`
- `sync.conflict.detected`
- `sync.conflict.resolved`
- `sync.convergence.completed`

## Reliability acceptance criteria

1. Offline -> online transitions produce convergence without acknowledged write loss.
2. Idempotent retry behavior prevents duplicate persisted operations.
3. Conflict resolution output is deterministic across repeated test runs.
4. Convergence timing remains within MVP SLO expectations under baseline network conditions.

## CRDT feasibility gate (timeboxed)

Before full adoption, run a CRDT spike with these exit criteria:

- Implementation complexity does not threaten milestone schedule.
- Runtime/storage overhead remains acceptable for browser-first constraints.
- Testability of deterministic convergence is practical in CI.

If criteria are not met by the timebox deadline, execute deterministic fallback for MVP and defer broader CRDT scope.

## Open decisions to revisit post-MVP

- Expand CRDT coverage to additional entity/field types.
- Add richer semantic merge hooks for domain-specific conflicts.
- Evaluate cross-device clock skew handling beyond current deterministic tiebreakers.
