# Haven MVP Architecture Note

## Purpose

Freeze the initial MVP architecture and execution decisions so implementation can begin with clear guardrails.

## Locked decisions

1. **One app first**
   - Start with one concrete app integration rather than a general multi-app SDK launch.
   - Goal is to validate reliability and developer workflow with one real integration.

2. **Single provider in v0**
   - Use one Haven-native provider path for v0.
   - Keep provider boundaries explicit so a protocol abstraction can be added later.

3. **Browser-only target in MVP**
   - No native/mobile targets in this phase.
   - Prioritize browser storage behavior, sync recovery, and observability in this environment.

4. **Conflict handling direction**
   - Prefer CRDT-based convergence where feasible within timeline and complexity budget.
   - If CRDT implementation risk is too high, allow a deterministic fallback with clear migration path.

5. **Schema enforcement policy**
   - Start with optional schema enforcement in SDK/runtime.
   - Capture telemetry on schema violations and tighten enforcement in a later phase.

6. **Security posture**
   - Use a phased approach: establish auth/authz and integrity baseline in MVP, then harden over time.

7. **Primary success metric**
   - Sync reliability is the main MVP KPI.

## One-app-first definition

- **Working app codename:** Haven Pilot App
- **Primary user role:** single end-user who writes and reads personal data across offline/online transitions
- **Top 3 user flows:**
  1. Create/update records while offline.
  2. Reconnect and converge without data loss.
  3. Refresh or reopen app and observe consistent synchronized state.

## Sync reliability SLO draft (MVP)

These are draft release gates and should be validated with real test data:

- **Sync operation success rate:** >= 99.5% across controlled test runs.
- **Convergence latency:** p95 <= 10 seconds after connectivity restoration in normal conditions.
- **Data integrity:** 0 known lost acknowledged writes in test suite.
- **Recovery behavior:** queue drains successfully after temporary network failures in >= 99% of injected failure scenarios.

## Immediate implementation focus

1. Establish storage + sync core path for the pilot app.
2. Add instrumentation for sync attempts, retries, failures, and convergence completion.
3. Build deterministic offline/online transition tests that assert no data loss.

## Review cadence

- Review this note weekly while checklist work is active.
- Update only through explicit decision records to avoid accidental scope drift.
