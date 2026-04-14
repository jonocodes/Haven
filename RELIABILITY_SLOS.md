# Haven Reliability SLOs and Acceptance Criteria (MVP)

## Purpose

Define measurable sync reliability targets and release gates for the browser-first pilot app.

## SLO measurement window

- Measure over rolling 7-day test windows in CI/staging.
- Track both aggregate and p95 behavior.
- Separate baseline network profile vs degraded-network profile reporting.

## Core SLOs

1. **Sync success rate**
   - Target: >= 99.5% successful sync operations.
   - Definition: sync operation = `pull` or `push` attempt that reaches terminal success/failure state.

2. **Convergence latency**
   - Target: p95 <= 10s from network restoration to convergence-complete event.
   - Baseline only; degraded profile reported separately.

3. **Acknowledged write durability**
   - Target: 0 acknowledged writes lost in test suite and soak runs.

4. **Retry recovery effectiveness**
   - Target: >= 99% recovery from transient failures within retry budget.

## Acceptable offline behavior

- Offline queue persists across app reload/restart.
- Queue size warning threshold: 5,000 ops (warn only).
- Queue hard-fail threshold: 20,000 ops (block new writes until drained or operator action).
- Retry budget per op: exponential backoff up to 15 minutes max interval.

## Data integrity checks

Run these checks in integration + soak suites:

1. **Loss check**
   - Every acknowledged op appears in final materialized state.

2. **Duplication check**
   - Idempotency prevents duplicate mutation application.

3. **Corruption check**
   - Entity invariants remain valid after repeated offline/online cycles.

4. **Ordering consistency check**
   - Conflict resolution produces deterministic final state across repeated runs.

## Pass/fail release gates

A release candidate is blocked if any of the following are true:

- Sync success rate < 99.5%.
- Convergence latency p95 > 10s in baseline profile.
- Any acknowledged write loss is observed.
- Integrity checks fail (loss/dup/corruption/determinism).

## Required metrics and dashboards

Minimum metrics to expose:

- `sync_pull_success_rate`
- `sync_push_success_rate`
- `sync_convergence_p95_ms`
- `sync_retry_count`
- `sync_quarantine_count`
- `acknowledged_write_loss_count`

## Test matrix expectations

- Baseline network profile: stable connectivity, moderate latency.
- Degraded profile A: intermittent disconnects.
- Degraded profile B: elevated latency + packet loss simulation.
- Long-run soak profile: continuous sync over extended session duration.

## Ownership and review

- Engineering owner updates SLO dashboard weekly.
- Release manager verifies gates before each candidate release.
- Any SLO breach requires a written mitigation and retest plan before shipping.
