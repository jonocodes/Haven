# Haven MVP Execution Milestones

## Purpose

Translate the pre-build checklist into milestone phases with explicit completion criteria.

## Milestone A — Local core

**Scope**
- Local document API
- IndexedDB persistence adapter
- Basic manifest loading

**Done when**
- Local CRUD for pilot entities is stable.
- Data persists across reloads.

## Milestone B — Sync transport and queueing

**Scope**
- Provider adapter integration
- Pull/push loop
- Retry + idempotency behavior

**Done when**
- Offline writes sync successfully after reconnect.
- Retry path avoids duplicate persisted operations.

## Milestone C — Conflict/convergence

**Scope**
- CRDT-preferred merge path (or approved fallback)
- Deterministic tie-break rules

**Done when**
- Deterministic convergence tests pass repeatedly.
- Conflict resolution traces are observable.

## Milestone D — Manifest lifecycle and safe upgrades

**Scope**
- Manifest version handling
- Migration preflight checks
- Destructive-change confirmation gates

**Done when**
- Additive and review-required migrations behave as specified.
- Destructive migrations require explicit confirmation.

## Milestone E — Reliability hardening and release readiness

**Scope**
- Reliability SLO dashboards
- Security Phase 0 launch gate
- Incident response drill

**Done when**
- Section 5 SLO gates pass.
- Section 6 security baseline is operational.
- Release checklist signed off.

## Tracking cadence and ownership

- Weekly milestone review with owners and blockers.
- Each milestone has one accountable engineering owner.
- Any slip > 1 week requires scope/risk re-evaluation entry in risks log.
