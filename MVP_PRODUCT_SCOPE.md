# Haven MVP Product Scope

## Objective

Deliver a browser-first Haven MVP that proves reliable offline-first sync for one pilot app using one Haven-native provider.

## In scope (MVP)

1. **Pilot app integration (single app)**
   - One concrete app uses Haven SDK/data layer end to end.

2. **Browser-first local data path**
   - Local read/write support with offline capability.

3. **Sync reliability focus**
   - Reliable reconnect, retry, and convergence behavior.
   - Instrumentation for sync success/failure and convergence timing.

4. **Single provider path**
   - Haven-native provider only for v0.

5. **Optional schema enforcement**
   - Runtime validation can be enabled, but strict enforcement is not required in MVP.

## Out of scope (non-goals for MVP)

- Multi-provider protocol implementation.
- Cross-app interoperability/shared schemas.
- Native mobile/Desktop clients.
- Enterprise-scale admin tooling.
- Hard-mandatory schema migrations for all writes.

## Primary users

- **Pilot end-user:** a single user interacting with personal app data across offline/online transitions.
- **Pilot developer/integrator:** internal developer wiring the app into Haven and observing sync behavior.

## Core user outcomes

1. User can create or edit data while offline.
2. User regains connectivity and changes converge without data loss.
3. User reloads/reopens and sees consistent synced state.

## First data entities

- `note`
  - fields: `id`, `title`, `body`, `updatedAt`, `deleted`
- `tag`
  - fields: `id`, `name`, `updatedAt`
- `noteTag`
  - fields: `id`, `noteId`, `tagId`, `updatedAt`

## Read/write patterns (pilot app)

- Frequent writes to `note.body` during editing.
- Periodic writes to metadata fields (`updatedAt`, `deleted`).
- Read lists of recent notes, filter by tag, fetch single note detail.
- Burst writes possible after reconnect when local queue drains.

## MVP success gates

- Meets draft sync reliability SLOs from `MVP_ARCHITECTURE_NOTE.md`.
- Passes offline -> online transition tests with no acknowledged write loss.
- Provides enough observability to diagnose sync failures and convergence delays.

## Deferred follow-ups

- Enforce stronger schema policies by default.
- Add provider abstraction layer once single-provider reliability is proven.
- Expand entity model beyond pilot app requirements.
