# Notes App (notesapp-rs) - Implementation Checklist

## Tech Stack
- **Runtime**: Bun
- **Frontend**: React + TypeScript
- **Router**: TanStack Router (file-based routing)
- **Storage Backend**: remotestorage.js
- **Styling**: Tailwind CSS + shadcn/ui (recommendation)

## Project Setup

### 1. Initialize Project
- [x] Run `bun init` in `notesapp-rs/`
- [x] Install dependencies: react, react-dom, @tanstack/react-router, @tanstack/react-query, tailwindcss, postcss, autoprefixer
- [ ] Set up shadcn/ui (run shadcn init, add components as needed)
- [x] Install remotestorage.js

### 2. Project Structure
```
notesapp-rs/
├── src/
│   ├── routes/
│   │   ├── __root.tsx        # root layout (sync init, connect banner)
│   │   ├── index.tsx         # / - note list
│   │   └── notes.$id.tsx     # /notes/:id - single note view
│   ├── lib/
│   │   ├── remotestorage.ts  # remoteStorage client wrapper
│   │   ├── notes.ts          # Note & SyncMetadata types
│   │   ├── sync.ts           # sync engine
│   │   └── db.ts             # Dexie IndexedDB wrapper
│   ├── components/
│   │   ├── NoteList.tsx
│   │   ├── NoteEditor.tsx
│   │   ├── SyncStatus.tsx
│   │   └── ConnectButton.tsx
│   ├── styles/
│   │   └── globals.css
│   ├── app.tsx               # React app + router setup
│   └── main.tsx              # React DOM entry
├── index.html
├── vite.config.ts
├── package.json
├── tsconfig.json
└── CHECKLIST.md
```

### Browser Storage Options (v1 default: Dexie)
- [x] **Dexie**: Simple, well-supported IndexedDB wrapper. Used for v1.
- [ ] **RxDB + Dexie + CRDT plugin**: Most interesting future path - could provide better conflict resolution
- [ ] **PouchDB**: Worth considering, but can pull experiment toward "Couch-like sync app" rather than "remoteStorage app"
- [ ] **WatermelonDB**: Probably least aligned for this specific browser-first test

## Features

### 3. Core Note Operations
- [x] Define `Note` type with: id, title, body, archived?, updatedAt
- [x] Define `SyncMetadata` type with: noteId, isDirty, lastAttemptedSyncAt?, lastConfirmedSyncAt?, syncError?
- [x] Implement browser storage with Dexie (IndexedDB)
- [x] Create note (local-first, generates id, sets updatedAt)
- [x] Edit note (updates local state immediately, marks as dirty)
- [x] List notes (ordered by updatedAt, filter out archived by default)
- [x] Archive note (soft delete, sets archived flag)
- [x] Delete note (hard delete)

### 4. remoteStorage Integration
- [x] Initialize remotestorage.js client
- [x] Connect button UI (enter remoteStorage address/provider)
- [x] Handle OAuth redirect flow (remoteStorage auth) — handled by remotestoragejs widget internally
- [x] Define storage layout per spec:
  ```
  /notes-app/
    common/
      notes/
        <note-id>.json
    settings/
      app-settings.json
    metadata/
      sync-state.json
  ```

### 5. Sync Engine
- [x] Track sync state per note (isDirty, lastConfirmedSyncAt, syncError)
- [x] Push behavior:
  - On connection
  - Periodically while online (30s interval)
  - After local edits (debounced ~1s)
  - On app resume/focus
- [x] Pull behavior:
  - On initial connect
  - On app startup if connected
  - Periodically while online (60s interval)
- [x] Conflict handling: latest updatedAt wins (per spec)

### 6. Sync Status UI
- [x] Per-note sync status display:
  - "Synced" - pushed successfully
  - "Pending sync" - isDirty = true
  - "Sync error" - last sync failed with error
  - "Not yet synced" - never been synced
- [x] Last edited timestamp display

### 7. UX / UI
- [x] App works fully offline (no blocking on login)
- [x] Connect to remoteStorage is optional
- [x] Show "Connect remoteStorage to sync your notes" prompt
- [x] Edits feel instant (local-first)
- [x] Sync happens in background

## Testing

### 8. Offline-First Testing
- [ ] Create notes offline
- [ ] Edit notes offline
- [ ] Go online and verify sync works
- [ ] Test multi-device scenario (if possible)

### 9. remoteStorage Flow Testing
- [ ] Test connect with remoteStorage provider
- [ ] Verify auth redirect works
- [ ] Verify notes sync to remoteStorage
- [ ] Verify pull from remoteStorage works

## Future Considerations (not for v1)
- CRDT
- [x] Filter by text (implemented in note list)
- Conflict resolution UI
- Device-specific directories for per-device state

## Push-triggered Pull via ntfy (needs design discussion)

**Idea:** Instead of (or in addition to) polling, use [ntfy](https://ntfy.sh) as a push signal to trigger a pull when another device has written new data to remoteStorage.

**Open questions to resolve before implementing:**

- **Who publishes to ntfy?** The app itself after a successful push? A server-side webhook on the remoteStorage server? The former is simpler but means the notifying device needs to know the topic.
- **Topic design:** Per-user topic (e.g. `notes-app-<user-hash>`)? Per-device? Public vs self-hosted ntfy server? Topic needs to be secret enough that other users can't spam it.
- **What does the ntfy message contain?** Just a "something changed" ping (app then does a full pull), or include metadata (which note id changed, from which device) to allow a targeted pull?
- **Browser support:** ntfy can be subscribed to via `EventSource` (SSE) in the browser — no service worker needed. But this keeps a persistent connection open. Is that acceptable?
- **Offline behavior:** If the tab is closed, the ntfy signal is missed. On next open the periodic poll / startup pull would catch up anyway — is that good enough, or do we need a service worker to receive background pushes?
- **Auth:** ntfy supports token-based auth for private topics. Where does the token live — user-configured in app settings, or derived from the remoteStorage identity?
- **Relationship to polling:** Does ntfy replace the 60s pull interval, or complement it as a faster path? Likely complement — ntfy for low-latency multi-device feel, polling as fallback.

**Proposed minimal design (v1 of this feature):**
1. User optionally configures a ntfy topic URL in app settings
2. After each successful push, app publishes a minimal ping to the topic
3. All connected tabs subscribe to the topic via SSE and trigger `pullAndMerge()` on receipt
4. Polling remains as fallback

## Browser Storage Comparison (Future Testing)
When comparing Dexie vs RxDB+CRDT vs PouchDB vs WatermelonDB, evaluate:
- Sync conflict handling quality
- Browser-first developer experience
- RemoteStorage alignment vs generic "Couch-like" sync model
- Bundle size / performance
