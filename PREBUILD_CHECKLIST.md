# Haven Pre-Build Checklist (MVP)

This checklist is tailored to the current decisions:
- start with **one app first**
- use a **single Haven-native provider** in v0
- prefer **CRDT conflict handling if feasible**
- keep schema enforcement **optional initially**
- phase in stronger security features over time
- target **browser only** first
- optimize for **sync reliability** as the primary success metric

## 0) Decision lock (do this first)

- [x] Capture and freeze MVP decisions in a short architecture note (`MVP_ARCHITECTURE_NOTE.md`).
- [x] Define what “one app first” means (app name, user role, top 3 user flows).
- [x] Define what counts as success for sync reliability (SLOs, test thresholds).

## 1) Product and scope baseline

- [x] Write a 1-page product scope for MVP (what Haven is and is not) (`MVP_PRODUCT_SCOPE.md`).
- [x] List explicit non-goals for MVP to avoid scope creep.
- [x] Identify the app’s first data entities and read/write patterns.

## 2) Single-provider architecture (Haven-native)

- [x] Document provider boundaries and interfaces used in v0 (`PROVIDER_BOUNDARIES.md`).
- [x] Ensure design leaves room for future provider protocol abstraction.
- [x] Define namespace/account ownership assumptions for the single provider.

## 3) Data model and schema policy

- [x] Draft an app manifest format (collections, fields, indexes, migration hints) (`APP_MANIFEST_SPEC.md`).
- [ ] Implement optional schema validation in SDK/runtime for v0.
- [x] Define upgrade path from optional to stricter validation later.
- [x] Specify destructive-change handling (warnings, confirmations, safeguards).

## 4) Sync and conflict model (reliability-first)

- [x] Choose CRDT approach for MVP (or document fallback if too high-risk for timeline) (`SYNC_CONFLICT_STRATEGY.md`).
- [x] Define authoritative conflict resolution behavior and edge-case rules.
- [x] Specify offline queue semantics (ordering, retries, backoff, idempotency).
- [x] Define reconnection flow and expected eventual consistency behavior.
- [x] Add observability fields/events for sync diagnostics.

## 5) Reliability SLOs and acceptance criteria

- [x] Define MVP sync SLOs (e.g., success rate, median and p95 convergence time) (`RELIABILITY_SLOS.md`).
- [x] Define acceptable offline behavior (max queue size, retry windows).
- [x] Define data integrity checks (duplication/loss/corruption detection).
- [x] Convert SLOs into pass/fail release gates.

## 6) Security and privacy (phased)

- [x] Define MVP auth/authz baseline for the user-owned namespace (`SECURITY_PRIVACY_PLAN.md`).
- [x] Document phased plan for stronger protections (e.g., deeper encryption posture).
- [x] Define incident response steps for sync/data integrity failures.

## 7) Browser-only delivery constraints

- [x] Confirm browser storage assumptions and quota behavior (`BROWSER_DELIVERY_CONSTRAINTS.md`).
- [x] Define supported browser matrix for MVP.
- [x] Add fallback behavior for storage limits and temporary connectivity loss.

## 8) Developer experience (for one app integration)

- [x] Create quickstart for the first app integration path (`DEVELOPER_EXPERIENCE_GUIDE.md`).
- [x] Add API examples for model definition, read/write, and sync status.
- [x] Define error taxonomy and actionable error messages.
- [x] Include migration guidance for manifest updates.

## 9) Test plan before wider build-out

- [x] Add end-to-end tests for offline -> online transitions (`TEST_PLAN.md`).
- [x] Add deterministic tests for conflict/convergence behavior (CRDT scenarios).
- [x] Add migration tests across manifest versions.
- [x] Add failure-injection tests (network drop, partial write, restart recovery).
- [x] Add soak test for long-running sync stability.

## 10) Execution milestones

- [x] Milestone A: local document API + storage adapter (`EXECUTION_MILESTONES.md`).
- [x] Milestone B: sync transport + retry/idempotency.
- [x] Milestone C: conflict/convergence implementation (CRDT or approved fallback).
- [x] Milestone D: manifest lifecycle + safe upgrade protections.
- [x] Milestone E: reliability hardening + release checklist.

## Tracking cadence

- [ ] Weekly checklist review with status updates.
- [ ] Keep a running risks/decisions log linked from this document.
- [ ] Mark blockers with owner + due date.
