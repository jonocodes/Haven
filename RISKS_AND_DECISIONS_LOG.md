# Haven Risks and Decisions Log

Use this file to track noteworthy architecture/product decisions and active risks.

## Decisions

| Date (UTC) | Decision | Owner | Notes |
|---|---|---|---|
| 2026-04-13 | MVP begins with one app integration, single Haven-native provider, browser-only target, sync reliability as primary KPI. | Team | Captured in `MVP_ARCHITECTURE_NOTE.md`. |
| 2026-04-13 | MVP product scope and first pilot entities (`note`, `tag`, `noteTag`) are locked for initial implementation. | Team | Captured in `MVP_PRODUCT_SCOPE.md`. |
| 2026-04-13 | Single-provider v0 adapter boundary is locked with provider-neutral seams for post-MVP protocol expansion. | Team | Captured in `PROVIDER_BOUNDARIES.md`. |
| 2026-04-13 | App manifest draft format and destructive-change policy are locked for MVP planning. | Team | Captured in `APP_MANIFEST_SPEC.md`. |
| 2026-04-13 | Sync/conflict model is set to CRDT-preferred with deterministic fallback and explicit reconnection/queue semantics. | Team | Captured in `SYNC_CONFLICT_STRATEGY.md`. |
| 2026-04-13 | Reliability SLO targets and release pass/fail gates are locked for MVP readiness decisions. | Team | Captured in `RELIABILITY_SLOS.md`. |
| 2026-04-13 | Security/authz baseline, phased hardening plan, and incident response workflow are locked for MVP execution. | Team | Captured in `SECURITY_PRIVACY_PLAN.md`. |
| 2026-04-14 | Browser-only constraints, support matrix, and fallback behavior are locked for MVP environment reliability. | Team | Captured in `BROWSER_DELIVERY_CONSTRAINTS.md`. |
| 2026-04-14 | Pilot app DX quickstart, error taxonomy, and migration guidance are locked for integration onboarding. | Team | Captured in `DEVELOPER_EXPERIENCE_GUIDE.md`. |
| 2026-04-14 | MVP test suite expectations and CI cadence are locked before expansion beyond pilot app. | Team | Captured in `TEST_PLAN.md`. |
| 2026-04-14 | Execution milestones A-E and completion criteria are locked for delivery tracking. | Team | Captured in `EXECUTION_MILESTONES.md`. |

## Active risks

| Date (UTC) | Risk | Impact | Mitigation | Owner | Status |
|---|---|---|---|---|---|
| 2026-04-13 | CRDT implementation complexity may delay MVP timeline. | High | Timebox CRDT spike; define deterministic fallback path before Milestone C. | Team | Open |
| 2026-04-13 | Browser storage quota/eviction behavior may affect reliability. | Medium | Add quota tests and fallback handling in browser matrix testing. | Team | Open |

## Weekly review checklist

- Confirm any new decisions are reflected in `MVP_ARCHITECTURE_NOTE.md`.
- Re-score active risks (likelihood/impact) and update mitigations.
- Add blockers with owner and due date in `PREBUILD_CHECKLIST.md` tracking cadence section.
