## Local pub/sub testing limitation

The DO input gate blocks new requests while a streaming SSE response is open.
This means `wrangler dev` and `vitest-pool-workers` (both use workerd/miniflare)
cannot test publish delivery to a live subscriber via HTTP — the publish request
queues behind the open SSE connection indefinitely. Works fine on production Cloudflare.

The pub/sub test in `ntfy_like_worker.test.ts` is currently skipped with a note.

**Workarounds to investigate:**

1. **`runInDurableObject`** (quickest to try)
   `cloudflare:test` exports `runInDurableObject(stub, callback)` which runs a
   callback directly inside the DO instance, bypassing HTTP and the input gate.
   Could subscribe via HTTP, then call `handlePublish` via `runInDurableObject`
   on the same stub — no second HTTP request needed.
   Docs: https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/

2. **Switch SSE → WebSocket hibernation** (proper fix, bigger change)
   Cloudflare recommends WebSocket hibernation over SSE for pub/sub on DOs.
   The hibernation API is designed to release the DO's event loop while clients
   stay connected, which would fix this exact problem at the architecture level.
   Docs: https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/

3. **Wait for upstream fix** (no action needed)
   Tracked in cloudflare/workers-sdk #11122 and #11031 (both closed). No fix yet as of April 2026.

---

## Making this closer to full featured nfty

My estimate for getting cfty “more feature complete” with ntfy:

Small step: 1–2 hours

Basic + Bearer auth
subscriber cap
polish response headers
auth docs/examples

Medium step: 1–2 days

replay buffer / since / Last-Event-ID
auth query param compatibility
richer publish metadata you skipped
better SSE compatibility details
basic topic permissions split for read vs write

Big step: 1–2 weeks

persistent message history
durable per-topic retention
delete/update semantics
attachments/actions/delayed delivery
proper user/accounts/access control
more complete ntfy-compatible API surface
better mobile-client compatibility expectations

Not realistically “tiny” anymore: 2–6+ weeks

web UI
Android/iOS behavior parity expectations
push integration model comparable to ntfy.sh
metrics/admin features/config breadth
robust production-grade compatibility testing

The main things that separate cfty from ntfy today are:

durability/history
broader auth/access-control model
richer message semantics
mobile-oriented delivery behavior
larger API surface and ecosystem expectations
