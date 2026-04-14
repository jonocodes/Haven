# RxDB + CRDT migration plan (ntfy deferred)

This repository currently uses Dexie as the local database and relies on remoteStorage for durable sync.

## Why this file exists

I attempted to install `rxdb` in this environment and hit a registry policy block (`403 Forbidden`), so a full in-repo migration cannot be completed until dependency installation is allowed.

## Target scope for first migration slice

1. Keep existing routes/components.
2. Replace Dexie read/write calls in `src/lib/db.ts` with an RxDB-backed implementation.
3. Store note body as CRDT-backed data and keep title/metadata in a normal collection.
4. Keep current sync loop for now (no ntfy changes in this phase).

## Proposed data model

- `notes_meta`
  - `id` (primary key)
  - `title`
  - `archived`
  - `updatedAt`
- `notes_content`
  - `id` (primary key = note id)
  - `crdtState` (serialized)
  - `updatedAt`
- `sync_meta`
  - `noteId`
  - `isDirty`
  - `lastAttemptedSyncAt`
  - `lastConfirmedSyncAt`
  - `syncError`
- `settings`
  - `key`
  - `value`
- `pending_deletes`
  - `noteId`

## Implementation checklist

- [ ] Add dependencies (`rxdb`, storage adapter package, CRDT plugin package).
- [ ] Create `src/lib/rxdb.ts` (database init + schemas).
- [ ] Re-implement db helpers in `src/lib/db.ts` against RxDB API.
- [ ] Update note editing path to apply CRDT updates for body changes.
- [ ] Add migration tests:
  - [ ] offline edit on two devices, then reconnect
  - [ ] deterministic merge of concurrent changes
  - [ ] search/filter query correctness on merged documents

## Commands attempted in this environment

```bash
npm install rxdb@latest
bun add rxdb
```

Both failed with `403 Forbidden` from the npm registry.
