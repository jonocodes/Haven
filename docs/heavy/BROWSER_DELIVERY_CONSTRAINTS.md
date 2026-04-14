# Haven Browser-Only Delivery Constraints (MVP)

## Purpose

Define browser-specific constraints, support matrix, and fallback behavior required for reliable MVP operation.

## Storage assumptions and quota behavior

- Primary local persistence: IndexedDB.
- Secondary cache layer (optional): Cache API for non-critical artifacts.
- Quota behavior varies by browser/profile; plan for eviction risk under storage pressure.

### Required handling

1. Detect storage write failures and classify as quota vs transient.
2. Emit `storage.quota.warning` telemetry when usage approaches threshold.
3. Trigger compaction/cleanup policy before hard failures.
4. Surface user-visible guidance when writes are blocked by quota.

## Supported browser matrix (MVP)

### Tier 1 (fully supported)

- Chrome (latest stable)
- Edge (latest stable)
- Firefox (latest stable)

### Tier 2 (best effort)

- Safari (latest stable) with known storage-behavior variability

### Out of scope (MVP)

- Legacy browser versions outside latest stable channels
- Browser extensions injecting incompatible storage/network behavior

## Connectivity assumptions

- Offline capability must function with no active network.
- Reconnect flow must resume automatically when connectivity returns.
- Temporary DNS/network failures should route through retry/backoff path.

## Fallback behavior requirements

1. **Quota pressure fallback**
   - Pause non-essential local caching.
   - Prioritize critical sync queue/state persistence.
   - Warn user and provide recommended cleanup actions.

2. **Transient connectivity fallback**
   - Queue writes locally and retry with backoff.
   - Preserve operation ordering and idempotency tokens.

3. **Storage corruption detection fallback**
   - Detect integrity mismatch.
   - Quarantine affected local segment.
   - Require recovery path from last known good synced state.

## Validation checks

- Browser matrix smoke tests pass for Tier 1.
- Quota exhaustion simulation confirms graceful degradation.
- Offline -> online transitions converge without acknowledged write loss.
- Storage recovery path restores operability after induced local corruption scenario.
