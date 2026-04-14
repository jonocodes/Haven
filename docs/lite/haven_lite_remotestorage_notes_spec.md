# Haven Lite — remoteStorage Notes App Spec

## Purpose

This document specifies the first experimental notes app built on top of remoteStorage.

The goal is not to implement the full Haven protocol yet. The goal is to test whether remoteStorage can provide a good user experience and a good foundation for a local-first notes app.

This spec focuses on:

- login and connection flow
- note data model
- sync model
- per-note metadata shown in the UI
- future namespace/subdirectory access model

---

## Core goals of this experiment

The remoteStorage version should help answer:

- does the remoteStorage login flow feel understandable?
- does user-owned storage feel natural in practice?
- how awkward is it to model notes on top of file storage?
- can offline-first behavior still feel smooth?
- how hard is it to support per-note metadata and sync state?

The app should still feel like a local-first notes app first.

---

## App shape

The first version is a single-user notes app with sync through remoteStorage.

The app should support:

- create note
- edit note
- list notes
- archive or delete note
- local-first editing
- background sync when connected
- note metadata shown in the UI

The app does not need to support collaboration yet.

---

## Login / connection flow

This is one of the main things the experiment should test.

### Desired user experience

The app should work locally before login.

Suggested first-run flow:

1. User opens the app
2. App immediately allows local note creation/editing
3. App shows an option such as:
   - "Connect remoteStorage to sync your notes"
4. User enters their remoteStorage address or provider identity
5. App starts the remoteStorage authorization flow
6. User approves the app’s access to its app-specific scope
7. App returns to the notes app with remoteStorage connected
8. App begins syncing local notes into the app’s remoteStorage area

### UX principles

- login should be optional at first
- the app should not block note-taking on login
- the provider/account concept should be visible and understandable
- the user should understand that the data lives in their remoteStorage account

### What to observe during testing

- whether entering a remoteStorage address/provider feels natural
- whether the auth redirect/approval flow feels understandable
- whether the user understands where their data lives
- whether reconnecting later is smooth

---

## Storage layout (initial)

The app should have one app-specific root scope/folder in remoteStorage.

A simple initial structure could be:

```text
/notes-app/
  _manifest.json
  notes/
    <note-id>.json
  metadata/
    sync-state.json
```

### Notes

Each note is stored as a JSON document.

### Manifest

The manifest can be minimal for now.

Its main purpose in this experiment is to give the app a predictable place to store app metadata and versioning information.

### Sync state

A metadata file may be used to track app-level sync state if helpful.

The exact shape can remain lightweight at this stage.

---

## Note data model

Each note should contain at least:

```ts
{
  id: string,
  title: string,
  body: string,
  archived?: boolean,
  updatedAt: string
}
```

### Meaning of fields

- `updatedAt`: last time the note was edited locally by the user/app

For this experiment, sync freshness should not be stored as canonical per-note remote data.

Instead, sync freshness should be treated as local UI state.

---

## Local sync metadata

The app may keep local-only sync metadata for each note, for example:

```ts
{
  noteId: string,
  isDirty: boolean,
  lastAttemptedSyncAt?: string,
  lastConfirmedSyncAt?: string,
  syncError?: string
}
```

This metadata is for the client UI and sync engine only. It does not need to be stored in remoteStorage as part of the note document.

The app may also keep a global sync timestamp such as:

- `lastSuccessfulSyncAt`

This is likely more useful than persisting a per-note remote `lastSyncedAt` field.

---

## Note UI metadata

When viewing an individual note, the top of the note should show:

- **Last edited:** `<timestamp>`
- **Sync status:** Synced / Pending sync / Sync error

Optionally, the app shell or note view can also show:

- **Last successful sync:** `<timestamp>`

If a note has never been successfully synced yet, the UI can show:

- **Sync status:** Not yet synced

### Why this matters

This helps the experiment test whether remoteStorage sync feels trustworthy.

Users should be able to tell:

- whether their latest change is only local
- whether the note has already been pushed to their remoteStorage account

---

## Local-first behavior

The app should always write locally first.

Expected behavior:

- creating/editing a note updates local state immediately
- `updatedAt` changes immediately
- sync status changes independently based on the sync engine state

This ensures the UI truthfully represents the difference between:

- local state
- remote durable state

---

## Sync model (initial)

The first sync model can be simple.

### Push behavior

- on connection
- periodically while online
- after local edits (debounced)
- on app resume/focus

### Pull behavior

- on initial connect
- on app startup if connected
- periodically while online
- on explicit refresh if needed

### Conflict handling (initial)

For the experiment, conflict handling can start simple.

Possible starting rule:

- latest `updatedAt` wins at the note level

This is acceptable for the first experiment because the goal is to test user experience and substrate fit, not to solve long-term merge behavior yet.

### Conflict handling (future)

A future version should revisit conflict handling for notes edited on devices that rarely connect.

This is important even without collaboration, because multiple personal devices can drift and later reconnect with conflicting note edits.

Future options to explore:

- richer merge policies
- field-aware merges
- CRDT-backed note documents
- note history / conflict copies

remoteStorage should not be assumed to provide CRDT semantics automatically. If Haven later needs CRDT behavior for notes, that will likely need to come from the app model or local engine, not from remoteStorage itself.

---

## What counts as “synced”

A note should be considered synced when:

- the note’s current local contents have been successfully written to remoteStorage
- the write operation completes without error

The app can reflect this through local sync state such as:

- `isDirty = false`
- updating local `lastConfirmedSyncAt`

This does not require persisting a canonical `lastSyncedAt` field in remoteStorage.

---

## Future access model: subdirectories within an app

This is not required for the first experiment, but it should influence the structure.

The desired future model is:

- different logged-in devices or identities may have access only to their own subdirectory
- every logged-in device/identity always has access to:
  - `common/`
  - `settings/`
- device- or identity-specific data lives in its own private subdirectory

### Proposed future structure

```text
/notes-app/
  common/
    notes/
    shared-metadata/
  settings/
    app-settings.json
  devices/
    <device-or-identity-id>/
      local-state.json
      drafts/
      device-cache/
```

### Semantics

#### `common/`
Contains documents every logged-in user or device on that account can see.

For the notes app, the canonical synced notes would likely live here.

#### `settings/`
Contains settings shared across all logged-in users/devices for that account.

Examples:

- app preferences
- view settings
- tag configuration

#### device-specific directory
Contains data visible only to that device or identity.

Examples:

- local-only state that should still persist remotely
- unsynced drafts
- caches or per-device UI state

---

## Implications of the future access model

Even though v1 may not implement the full access model, the app should avoid a storage layout that blocks it later.

That suggests:

- canonical notes should eventually live under `common/`
- app settings should eventually live under `settings/`
- per-device sync/cache state should eventually move under a device-specific directory

A v1 layout may be simpler, but it should be designed so it can evolve into this structure without a total rewrite.

---

## Suggested v1 compromise

For the first experiment, use a simplified layout that still anticipates the future model:

```text
/notes-app/
  common/
    notes/
      <note-id>.json
  settings/
    app-settings.json
  metadata/
    sync-state.json
```

This keeps the first version simple while still nudging the design toward:

- shared canonical notes in `common/`
- shared app configuration in `settings/`

Device-specific directories can be added later.

---

## Dexie and local persistence

Using Dexie for local persistence is a reasonable choice for this experiment.

Suggested role for Dexie:

- store canonical local notes
- store local-only sync metadata
- support local queries and rendering

Dexie hooks may be useful for small mechanical tasks such as:

- automatically updating `updatedAt`
- marking notes as dirty after edits

Dexie hooks should not be the main place where sync orchestration lives.

The sync flow should stay explicit and understandable.

---

## Future note format: Markdown

Markdown support should be considered a future enhancement.

It does not need to be part of the first experiment, but it should be kept in mind while designing the note model. A good library to use would be https://github.com/blueberrycongee/codemirror-live-markdown

Implications:

- `body` may later contain markdown text
- note rendering may later distinguish between raw source and rendered view
- future merge/conflict behavior may be more complex if notes are long markdown documents

This is another reason to keep future CRDT exploration in mind, especially for rarely connected devices editing longer notes.

---

## Questions this experiment should answer

- does the remoteStorage login flow feel good enough for normal users?
- does showing `Last edited` and `Last synced to this account` make sync state clearer?
- is the file-oriented storage model awkward for notes?
- does the future `common/settings/device` directory structure feel natural?
- does remoteStorage feel like a credible foundation for Haven-style user-owned app data?

---

## Working thesis

The remoteStorage notes app should be built as a local-first app with optional sync.

The experiment should pay close attention to whether:

- user-owned login/setup feels better than a custom sync target
- note-level sync metadata makes the model trustworthy
- file-and-directory structure becomes a help or a burden as the app grows

This will help determine whether remoteStorage is a viable substrate for Haven Lite.

