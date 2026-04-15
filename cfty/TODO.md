# To get closer parity to ntfy

## Phase 1 — Polish (1–2 hours)

- [ ] Basic + Bearer auth
- [ ] Subscriber cap
- [ ] Polish response headers
- [ ] Auth docs/examples

## Phase 2 — Compatibility (1–2 days)

- [ ] Replay buffer / `since` / `Last-Event-ID`
- [ ] Auth query param compatibility
- [ ] Richer publish metadata (priority, tags, click, etc.)
- [ ] Better SSE compatibility details
- [ ] Basic topic permissions split (read vs write)

## Phase 3 — Features (1–2 weeks)

- [ ] Persistent message history
- [ ] Durable per-topic retention
- [ ] Delete/update semantics
- [ ] Attachments, actions, delayed delivery
- [ ] Proper user/accounts/access control
- [ ] More complete ntfy-compatible API surface
- [ ] Better mobile-client compatibility expectations

## Phase 4 — Full product (2–6+ weeks)

- [ ] Web UI
- [ ] Android/iOS behavior parity
- [ ] Push integration model comparable to ntfy.sh
- [ ] Metrics/admin features/config breadth
- [ ] Robust production-grade compatibility testing

---

The main things that separate cfty from ntfy today:
- Durability/history
- Broader auth/access-control model
- Richer message semantics
- Mobile-oriented delivery behavior
- Larger API surface and ecosystem expectations
