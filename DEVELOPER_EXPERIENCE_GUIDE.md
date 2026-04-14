# Haven Developer Experience Guide (Pilot App)

## Purpose

Provide the minimum integration experience for the first app so implementation is straightforward and debuggable.

## Quickstart path

1. Install Haven client package.
2. Initialize local store and provider adapter.
3. Load app manifest.
4. Start sync loop.
5. Observe sync state/events.

## Minimum API examples to provide

### 1) Model/bootstrap

- Initialize app with manifest and namespace scope.
- Register provider adapter and sync callbacks.

### 2) Write operations

- Create/update/delete `note` documents.
- Persist writes offline with operation IDs.

### 3) Read operations

- Query recent notes.
- Fetch note by ID.
- Filter notes by tag relation.

### 4) Sync status

- Expose `idle`, `syncing`, `degraded`, `quarantined` states.
- Surface latest convergence timestamp and pending queue size.

## Error taxonomy and messaging

Canonical categories and user/developer actions:

- `auth_error` -> prompt re-authentication.
- `permission_error` -> display access-denied with troubleshooting link.
- `transient_network_error` -> show retrying indicator.
- `validation_error` -> include field/path mismatch details for developer logs.
- `conflict_error` -> record conflict resolution path and final outcome.
- `unknown_provider_error` -> capture diagnostics and suggest retry/report.

## Migration guidance

1. Bump manifest `schemaVersion`.
2. Include migration hints (`fromVersion`, `toVersion`, `type`, `steps`).
3. Run preflight validation against local and synced data snapshots.
4. Roll out behind feature flag if change is review-required/destructive.

## DX acceptance checks

- New developer can bootstrap pilot app in <= 30 minutes.
- Error messages are actionable without source diving.
- Sync status is visible in both logs and UI.
- Migration dry-run identifies breaking changes before rollout.
