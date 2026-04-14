# Notes App

A local-first notes app for testing remoteStorage as a sync backend — without a full Haven protocol. Goal is to evaluate UX, sync granularity, performance, and the remoteStorage login flow.

See [spec](../docs/lite/haven_lite_remotestorage_notes_spec.md) for full design details.

## Stack

- **Runtime**: Bun
- **Frontend**: React + TypeScript + TanStack Router
- **Local storage**: Dexie (IndexedDB)
- **Sync backend**: remotestorage.js
- **Styling**: Tailwind CSS v4

## RxDB + CRDT migration

There is a concrete migration plan for moving from Dexie to RxDB + CRDT (with ntfy intentionally deferred) in [`RXDB_MIGRATION.md`](./RXDB_MIGRATION.md).

## Running

```sh
bun install
bun run dev
```

Then open http://localhost:5173.

## Building

```sh
bun run build
```

Output goes to `dist/`.

## Usage

The app works fully offline — no login required. Notes are stored locally in IndexedDB.

You can also import one or more Markdown files via **Upload .md** on the notes list page.

To sync across devices, click **"Connect remoteStorage to sync your notes"** in the top bar and enter your remoteStorage address (e.g. `user@example.com`). The app will redirect through OAuth and then begin syncing in the background.
