# Haven MVP Test Plan

## Purpose

Define the required test suites before expanding beyond the pilot app.

## Test suites

### 1) End-to-end offline/online transitions

- Create and edit data while offline.
- Reconnect and verify queue drain + convergence.
- Assert no acknowledged write loss.

### 2) Conflict/convergence deterministic tests

- CRDT path tests for supported fields.
- Fallback deterministic LWW tie-break tests.
- Repeat-run consistency checks for identical inputs.

### 3) Manifest migration tests

- Upgrade from schemaVersion N -> N+1 (additive).
- Review-required changes (rename/type narrow) with confirmation path.
- Destructive migrations blocked without explicit confirmation.

### 4) Failure-injection tests

- Network flap during push.
- Partial acknowledgment responses.
- Process restart during pending queue.
- Provider timeout/rate-limit scenarios.

### 5) Long-run soak tests

- Extended sync session with periodic disconnects.
- Monitor memory/storage growth and queue health.
- Validate durability and convergence over long windows.

## Required assertions

- No acknowledged write loss.
- No duplicate persisted operations after retry.
- Deterministic final state under conflict scenarios.
- Recovery path works after simulated failures.

## CI expectations

- Smoke suite runs on every PR.
- Full reliability suite runs nightly.
- Soak suite runs on release-candidate branches.

## Exit criteria before multi-app expansion

- Reliability SLO gates pass for 2 consecutive weekly windows.
- No unresolved SEV-1 issues in prior 14 days.
- Migration and failure-injection suites remain stable.
