# Haven Provider Boundaries (MVP v0)

## Purpose

Define the single-provider interface boundaries for MVP so implementation can proceed now without blocking a future multi-provider protocol abstraction.

## MVP provider model

- **Provider mode:** single Haven-native provider in v0.
- **Client target:** browser-only.
- **Design rule:** keep all provider-specific behavior behind a thin adapter contract.

## Namespace and ownership assumptions

1. Each end-user has a provider-backed namespace they control.
2. The pilot app writes only within its own app-scoped namespace area.
3. Cross-app data access is out of scope in MVP.
4. Provider operations must not allow one app scope to mutate another app scope.

## Minimal adapter contract (v0)

The MVP implementation should enforce these contract surfaces:

1. `connect(session)`
   - Establish auth/session context and verify namespace access.

2. `pull(cursor)`
   - Fetch remote changes since cursor.
   - Return deterministic ordering metadata for convergence processing.

3. `push(batch)`
   - Submit local queued mutations.
   - Require idempotency tokens to avoid duplicate application on retries.

4. `ack(batchId, status)`
   - Confirm server acceptance/rejection to drive client queue transitions.

5. `subscribe(optional)`
   - Optional near-real-time invalidation/signal channel.
   - MVP may poll if subscription channel is unavailable.

## Provider-specific responsibilities (inside adapter)

- Auth handshake specifics.
- Transport details (HTTP/WebSocket/etc.).
- Cursor encoding/decoding strategy.
- Error code translation into Haven canonical error categories.

## Haven-core responsibilities (outside adapter)

- Local-first data model and storage behavior.
- Queue management, retry policy, and backoff strategy.
- Conflict/convergence logic (CRDT-preferred or approved fallback).
- Telemetry emission and reliability SLO tracking.

## Error taxonomy baseline

Adapter should normalize provider errors into stable categories:

- `auth_error`
- `permission_error`
- `transient_network_error`
- `rate_limited`
- `validation_error`
- `conflict_error`
- `unknown_provider_error`

## Future abstraction seams (post-MVP)

To keep v0 extensible:

- Avoid leaking provider wire types into app-level APIs.
- Keep adapter input/output DTOs provider-neutral.
- Store migration-safe sync metadata (cursor versioning) to support new providers later.

## Acceptance checklist for this boundary doc

- [x] Provider boundaries and responsibilities defined.
- [x] Future protocol abstraction seams identified.
- [x] Namespace/account ownership assumptions documented.
