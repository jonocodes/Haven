# RxDB + CRDT migration plan (ntfy deferred)

This repository currently uses Dexie as the local database and relies on remoteStorage for durable sync. The goal of this migration is to replace the Dexie storage layer with RxDB, move note body storage to a CRDT-backed representation, and keep the current route/component structure intact for the first slice.

## Current codebase baseline

These files define the existing storage and sync contract:

- `src/lib/db.ts`
  - owns the Dexie schema and all local persistence helpers
  - stores each note as a single record with `title`, `body`, `archived`, `updatedAt`
- `src/lib/notes.ts`
  - exports the current `Note` shape consumed across the app
- `src/lib/sync.ts`
  - pushes full note records to remoteStorage
  - resolves conflicts with `updatedAt` last-write-wins
- `src/components/NoteEditor.tsx`
  - subscribes directly to Dexie via `useLiveQuery`
  - keeps `body` as a plain string and calls `updateNote()` on every edit
- `src/tests/db.test.ts`
  - tests Dexie tables directly
- `src/tests/sync.test.ts`
  - encodes the current sync semantics, including timestamp conflict resolution

That means the real migration is not just "swap Dexie for RxDB". It changes:

- local schema layout
- read subscription mechanism in React
- edit/write semantics for note bodies
- sync conflict handling
- test fixtures and assertions

## Why this file exists

This file tracks the staged migration from the original Dexie-backed implementation to an RxDB-backed runtime, while CRDT sync semantics are still incomplete.

## Constraints for the first migration slice

1. Keep the existing routes and major components.
2. Keep remoteStorage as the transport for now.
3. Defer ntfy entirely.
4. Minimize UI churn by preserving the current app-facing `Note` shape where practical.
5. Introduce CRDT storage for the note body without forcing the whole app to understand CRDT internals on day one.

## Target architecture

Use RxDB as the local database and split note metadata from note content.

### Collections

- `notes_meta`
  - `id` primary key
  - `title`
  - `archived`
  - `updatedAt`
- `notes_content`
  - `id` primary key, same value as note id
  - `crdtState` serialized Yjs update
  - `plainText`
  - `updatedAt`
- `sync_meta`
  - `noteId` primary key
  - `isDirty`
  - `lastAttemptedSyncAt`
  - `lastConfirmedSyncAt`
  - `syncError`
- `settings`
  - `key` primary key
  - `value`
- `pending_deletes`
  - `noteId` primary key

### Why keep `plainText` alongside `crdtState`

This codebase still needs a fast string representation for:

- `NoteEditor` initial render
- existing markdown export/import flow
- note list previews and any search/filtering
- compatibility with the current remoteStorage payload shape during the transition

For the first slice, `plainText` should be treated as derived data from the CRDT document. That avoids reconstructing the visible body string in every caller and lets the rest of the app keep using `body: string` until the editor and sync layers are fully CRDT-aware.

## CRDT Choice

Use `yjs` for note-body CRDT state.

That is deliberate for this app:

- the sync path is still custom `remoteStorage`, so the RxDB CRDT plugin would not remove the transport or merge work
- the body field is the only data that needs CRDT semantics right now
- the current implementation stores the serialized Yjs update in `notes_content.crdtState` and derives `plainText` from it for search, previews, and editor hydration
- RxDB still owns local persistence and observation; Yjs only owns the mergeable body payload

Do not treat this as a placeholder. The body CRDT for this migration is Yjs unless we explicitly revisit that decision.

## App-facing compatibility layer

Do not let the rest of the app talk to raw RxDB collections directly.

Instead:

1. Add `src/lib/rxdb.ts` for database initialization, schemas, and collection exports.
2. Keep `src/lib/db.ts` as the app-facing storage module, but re-implement its helpers on top of RxDB.
3. Preserve these functions as the main contract while their internals change:
   - `createNote`
   - `updateNote`
   - `archiveNote`
   - `deleteNote`
   - `listNotes`
   - `getNote`
   - `getDirtyNotes`
   - sync metadata helpers

This keeps the migration boundary tight. Most of the app should continue importing `src/lib/db.ts`, not `src/lib/rxdb.ts`.

## Proposed type changes

The current `Note` interface in `src/lib/notes.ts` is:

```ts
export interface Note {
  id: string
  title: string
  body: string
  archived?: boolean
  updatedAt: string
}
```

Keep that shape for app consumers in the first slice.

Add internal document types for RxDB, for example:

```ts
interface NoteMetaDoc {
  id: string
  title: string
  archived?: boolean
  updatedAt: string
}

interface NoteContentDoc {
  id: string
  crdtState: string
  plainText: string
  updatedAt: string
}
```

Then rehydrate the public `Note` type in `getNote()` and `listNotes()` by joining `notes_meta` and `notes_content`.

## Migration checklist

- [x] Unblock package installation for the chosen CRDT dependency.
- [x] Add `src/lib/rxdb.ts` with RxDB schemas and initialization.
- [x] Keep `src/lib/db.ts` as the app-facing storage facade during the migration.
- [x] Remove direct Dexie table reads from React components by introducing storage-facing readers/hooks.
- [x] Split local storage into `notes_meta` and `notes_content`.
- [x] Preserve the current public `Note` shape by joining metadata and content in storage helpers.
- [x] Add body-specific helpers that can switch from plain strings to CRDT-backed state.
- [x] Replace whole-string body writes in `NoteEditor` with a body-specific storage helper.
- [ ] Replace timestamp last-write-wins body conflict handling in sync.
- [x] Rewrite storage tests around merged CRDT behavior.
- [x] Rewrite sync tests around merged CRDT behavior.
- [ ] Add E2E coverage for concurrent offline edits and deterministic merge.

## Migration phases

### Phase 0: dependency unblock

- [x] Add RxDB dependencies once package installation is allowed.
- [x] Add the CRDT dependency chosen for note body state.
- [x] Confirm RxDB works in browser runtime and build output.
- [x] Add dedicated RxDB test coverage under `fake-indexeddb` instead of relying on legacy Dexie tests.

### Phase 1: local storage replacement without behavior change

Goal: move from Dexie to RxDB while keeping current last-write-wins behavior.

Steps:

- [x] create `src/lib/rxdb.ts`
- [x] define collections for `notes_meta`, `notes_content`, `sync_meta`, `settings`, `pending_deletes`
- [x] re-implement `src/lib/db.ts` helpers using RxDB
- [x] continue storing `plainText` and `crdtState`, but allow `crdtState` to be generated from the whole body string initially
- [x] keep `src/lib/sync.ts` payloads compatible with the current remoteStorage format

Exit criteria:

- [x] routes still render without structural changes
- [x] existing `db` tests are ported to helper-level tests rather than direct Dexie table access
- [x] sync tests assert CRDT merge semantics for body conflicts

### Phase 2: editor write path becomes CRDT-aware

Goal: stop treating note body edits as whole-string replacements.

Steps:

- [x] add body-specific helpers in `src/lib/db.ts`, for example:
  - `applyBodyUpdate(noteId, nextText)`
  - `getBodyText(noteId)`
  - `getBodyCrdtState(noteId)`
- [x] update `src/components/NoteEditor.tsx` so body edits flow through the CRDT helper instead of `updateNote(noteId, { body })`
- [x] keep title edits on the metadata collection
- [ ] decide whether `updatedAt` should reflect:
  - any local edit to title or body, or
  - only material user-visible content changes

Important constraint:

`NoteEditor` no longer reads Dexie tables directly. It now goes through storage-facing observation hooks, which is the seam the RxDB runtime uses today.

### Phase 3: sync path becomes CRDT-aware

Goal: eliminate last-write-wins for body conflicts.

Steps:

- [ ] update remote payloads to include CRDT state or CRDT operations for note bodies
- [ ] keep title/archive metadata as conventional fields
- [ ] merge body state by CRDT rules on pull
- [ ] stop overwriting full note bodies based only on `updatedAt`
- [ ] retain tombstone handling for deletes

`src/tests/sync.test.ts` now asserts:

- concurrent body edits merge deterministically
- title-only updates do not clobber body state
- merged body state is what gets pushed back out after pull/merge

## React integration plan

The current component contract assumes this pattern:

- read one note reactively
- read its sync metadata reactively
- store title/body in local component state
- overwrite local state when a clean remote change arrives

RxDB changes the implementation details, but the UI contract can remain similar if the storage layer exposes:

- `observeNote(noteId)`
- `observeSyncMeta(noteId)`
- or a dedicated hook such as `useNote(noteId)`

The main thing to avoid is scattering collection joins and CRDT decoding inside components. Keep that in storage-facing utilities.

## Sync behavior changes to make explicit

Current behavior in `src/lib/sync.ts`:

- push full dirty notes
- on pull, insert if missing
- otherwise overwrite local note if remote `updatedAt` is newer
- delete local note if a remote tombstone exists

Target behavior after CRDT cutover:

- push merged metadata + body state
- on pull, merge body state instead of picking a winner by timestamp
- continue using explicit tombstones for deletes
- update `sync_meta` based on successful transport, not conflict winner selection

## Test plan

### Tests that need rewriting

- [x] `src/tests/db.test.ts`
  - now validates RxDB-backed helper behavior and collection-join correctness
  - runs with `fake-indexeddb` test setup
- [ ] `src/tests/sync.test.ts`
  - remove expectations that encode timestamp-based body conflict resolution

### New tests required

- [ ] local storage
  - `createNote()` creates both `notes_meta` and `notes_content`
  - `getNote()` joins metadata + content into the public `Note` shape
  - `listNotes()` orders by metadata `updatedAt`
  - deleting a note removes both local documents and writes a tombstone
- [ ] CRDT behavior
  - applying sequential local body edits updates both `crdtState` and derived `plainText`
  - hydrating from stored `crdtState` reproduces the same body text
  - concurrent body updates merge deterministically
- [ ] sync
  - [x] offline edit on two devices, then reconnect (covered in sync unit tests)
  - [x] title-only update plus concurrent body update
  - [x] merged body content survives pull/push round trips
  - [ ] search/filter queries still operate on merged `plainText`

### E2E coverage to add or adjust

- [ ] create a note on device A while offline
- [ ] edit same note body on both devices
- [ ] reconnect both devices
- [ ] verify merged content appears in the editor rather than whichever side had later `updatedAt`

## Open design decisions

These need to be settled before implementation to avoid churn:

- Will remoteStorage store full CRDT snapshots, incremental updates, or both?
- Do we need per-note actor/device ids for CRDT provenance?
- Should `updatedAt` remain user-facing "last edited" time even when conflict merges replay older operations?
- Do we want search to index `plainText` only, or eventually search structured CRDT content?

## Recommended implementation order

1. Unblock dependency installation.
2. Add `src/lib/rxdb.ts` and internal RxDB document types.
3. Port `src/lib/db.ts` to RxDB while preserving the public helper API.
4. Replace Dexie-specific React subscriptions with RxDB-backed observation helpers.
5. Introduce CRDT-aware body helpers and switch the editor body path to them.
6. Update sync payloads and merge logic.
7. Rewrite tests from timestamp conflict expectations to merge expectations.

## Commands attempted in this environment

```bash
bun install rxdb
```

`rxdb` is now present in `package.json` and the runtime path has been migrated to it. `yjs` is the chosen body CRDT for this repository.
