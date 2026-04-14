# Haven Lite — Fireproof Notes App Spec

## Purpose

This document specifies the first experimental notes app built on top of Fireproof.

The goal is not to implement the full Haven protocol yet. The goal is to test whether Fireproof, combined with a minimal custom sync server, can provide a good user experience and a good foundation for a local-first notes app.

This spec focuses on:

- login and connection flow
- note data model
- sync model
- per-note metadata shown in the UI
- role of the minimal custom server
- future conflict handling for rarely connected devices

---

## Core goals of this experiment

The Fireproof version should help answer:

- does Fireproof make the local-first notes app model feel simpler?
- does a minimal sync-target login feel understandable enough?
- how smooth does offline-first behavior feel in practice?
- how much sync behavior comes naturally from the substrate?
- does this reduce custom sync and reconciliation logic compared with remoteStorage?

The app should still feel like a local-first notes app first.

---

## App shape

The first version is a single-user notes app with sync through Fireproof and a minimal custom server.

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
   - "Enable sync"
4. User enters or selects their sync target
   - e.g. server URL plus login credentials or token
5. App starts the sync-target login flow
6. User authenticates to the sync server
7. App returns to the notes app with sync enabled
8. App begins syncing local notes to the sync target

### UX principles

- login should be optional at first
- the app should not block note-taking on login
- the sync-target concept should be understandable
- the app should still feel local-first, not server-first

### What to observe during testing

- whether entering a server URL or connecting to a sync target feels natural
- whether the login flow feels understandable
- whether reconnecting later is smooth
- whether this feels weaker or more awkward than remoteStorage’s provider/account story

---

## Minimal custom server

The Fireproof experiment uses a minimal custom server as the sync target.

This server is not meant to be a full Haven provider.

Its job is only to provide enough remote coordination and persistence to test the app experience.

### The server should do only a few things

- authenticate the user
- provide a durable sync target
- store remote sync data
- support pulling and pushing changes
- give the app a stable place to reconnect to

### The server should not try to become

- a full provider ecosystem
- a rich app backend
- a collaboration service
- a server-side query engine for normal app use

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

For this experiment, sync freshness should not be stored as canonical per-note shared data.

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

The app may also keep a global sync timestamp such as:

- `lastSuccessfulSyncAt`

This metadata is for the client UI and sync engine only.

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

This keeps the Fireproof version comparable to the remoteStorage version.

Users should be able to tell:

- whether their latest change is only local
- whether the note has already been durably synced

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

Even if Fireproof can support richer merge behavior later, the first comparison should stay simple and symmetrical with the remoteStorage experiment.

---

## What counts as “synced”

A note should be considered synced when:

- the note’s current local contents have been successfully pushed to the sync target
- the sync operation completes without error

The app can reflect this through local sync state such as:

- `isDirty = false`
- updating local `lastConfirmedSyncAt`

This does not require persisting a canonical per-note `lastSyncedAt` field.

---

## Storage model

For this experiment, Fireproof should be treated as the local-first document engine.

That means:

- notes are stored locally as documents
- local queries happen against the local store
- sync is layered on top through the minimal custom server

The app should not depend on a separate local database abstraction for the first Fireproof experiment.

---

## Why this experiment is useful

The Fireproof version should help reveal whether:

- the local-first developer experience is significantly cleaner
- the sync model feels more natural
- the custom server burden can stay small enough
- the weaker provider story is acceptable if the app experience is much better

---

## Future note format: Markdown

Markdown support should be considered a future enhancement.

It does not need to be part of the first experiment, but it should be kept in mind while designing the note model.

Implications:

- `body` may later contain markdown text
- note rendering may later distinguish between raw source and rendered view
- future merge/conflict behavior may be more complex if notes are long markdown documents

This is another reason to keep future CRDT exploration in mind, especially for rarely connected devices editing longer notes.

---

## Questions this experiment should answer

- does the sync-target login flow feel good enough for normal users?
- does showing `Last edited` and sync status make sync state clearer?
- does Fireproof reduce the amount of custom sync and reconciliation logic?
- does the app feel better offline and during reconnect?
- does Fireproof feel like a credible foundation for Haven Lite even if the provider story is initially weaker than remoteStorage?

---

## Working thesis

The Fireproof notes app should be built as a local-first app with optional sync.

The experiment should pay close attention to whether:

- the local-first developer and user experience is noticeably better
- the sync substrate reduces complexity enough to matter
- a minimal custom sync server is a reasonable compromise

This will help determine whether Fireproof is a viable substrate for Haven Lite.

