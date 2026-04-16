
# Build an offline-first media capture web app

Build a **browser-first React + TypeScript app** that also works as an installable **PWA**. The app must capture photos, store them offline, sync them with **remoteStorage.js**, and provide a gallery/detail UI for browsing, renaming, and deleting media.

Use:

* **React**
* **Vite**
* **TypeScript**
* **TanStack Router**
* **Dexie** for local IndexedDB
* **remoteStorage.js** for sync/storage
* Service worker + manifest for PWA mode

The app must work in a normal browser tab over **HTTPS or localhost**. Camera access uses `getUserMedia()`, which requires a secure context, and remoteStorage.js supports local browser storage plus cross-device sync. TanStack Router is a good fit for typed client-side routing, and Dexie is a solid IndexedDB wrapper for offline-first apps. ([MDN Web Docs][1])

## Product goals

Create an app that can:

* capture **photos**
* optionally support **video** later without redesigning the data model
* store media files plus metadata
* keep a fast **offline gallery**
* sync data through **remoteStorage.js**
* allow users to **rename** and **delete** items
* show metadata in a detail view:

  * name
  * dimensions
  * file size
  * MIME type
  * GPS coordinates
  * timestamps
  * sync status

## Key architecture decisions

### 1) Browser-first, PWA-second

The app should work as a normal browser app and also be installable as a PWA. Do not make installation a requirement for camera usage. `getUserMedia()` works in secure contexts, not only in installed PWAs. ([MDN Web Docs][1])

### 2) Use Dexie, not RxDB, for v1

Use **Dexie only** for the local database. Do **not** add RxDB in v1.

Reason:

* schema is simple
* local query needs are modest
* sync is already handled by remoteStorage.js
* adding RxDB would introduce unnecessary complexity

### 3) Separate file storage from metadata storage

Store the **media blob** and the **metadata JSON** separately.

remoteStorage.js `BaseClient` supports folders, objects, and files, with `storeObject/getObject` for JSON and `storeFile/getFile` for files. Use those primitives directly. ([remoteStorage][2])

### 4) Renaming changes metadata only

A user rename must only update the metadata field `name`. Do **not** rename the underlying remote file path after capture.

### 5) Resize photos before saving

Captured photos must be downsized locally before storage to reduce space use.

Default target:

* max width/height: **1920 px**
* format: **JPEG** or **WebP**
* quality: **0.8**

Keep this configurable.

### 6) GPS is optional metadata

Try to capture geolocation, but do not block saving if location is unavailable or permission is denied.

### 7) Use stable IDs

Every captured item gets a stable UUID. Paths and local records are keyed by that ID.

---

# Required routes

Use **TanStack Router** with typed routes. TanStack Router supports nested routing, typed navigation, and route loaders. ([TanStack][3])

Implement these routes:

* `/` → redirect to `/gallery`
* `/capture`
* `/gallery`
* `/media/$mediaId`
* `/settings`

Optional nested layout:

* root layout with nav/header
* child routes for capture/gallery/detail/settings

---

# Data model

Define this TypeScript model for the local catalog.

```ts
type SyncState = 'pending' | 'synced' | 'error'

type GpsMetadata = {
  latitude: number
  longitude: number
  accuracyMeters?: number | null
  altitude?: number | null
  heading?: number | null
  speed?: number | null
  timestamp?: string | null
}

type MediaItem = {
  id: string
  kind: 'photo' | 'video'

  name: string | null
  originalFilename: string
  mimeType: string

  width: number | null
  height: number | null
  durationMs: number | null

  fileSizeBytes: number

  mediaPath: string
  metadataPath: string
  thumbnailPath: string | null

  createdAt: string
  updatedAt: string
  gps: GpsMetadata | null

  processing: {
    resized: boolean
    originalWidth?: number | null
    originalHeight?: number | null
    quality?: number | null
  }

  sync: {
    state: SyncState
    lastSyncedAt?: string | null
    error?: string | null
  }

  deletedAt?: string | null
}
```

---

# Storage layout

Use a scoped remoteStorage module/path such as `media`.

Suggested remote paths:

* `/media/items/{id}/original.jpg`
* `/media/items/{id}/thumb.jpg`
* `/media/items/{id}/meta.json`

Use:

* **file storage** for image/video blobs
* **JSON object storage** for metadata records

remoteStorage.js supports using scoped clients and modules for app data. ([remoteStorage][2])

---

# Dexie schema

Create a Dexie database with at least one main table:

```ts
mediaItems: 'id, kind, createdAt, updatedAt, deletedAt, sync.state, name'
```

Optional extra tables:

* `settings`
* `syncQueue`
* `appState`

Requirements:

* gallery reads from Dexie first
* all writes hit Dexie immediately
* sync state is updated asynchronously
* deleted items are hidden from normal gallery queries

---

# remoteStorage integration

Initialize remoteStorage.js and create a scoped client for the `media` namespace.

Required behavior:

* configure remoteStorage connection
* claim access for the app scope
* enable caching/offline behavior for the scope
* use `storeFile` for binary media
* use `storeObject` for metadata JSON
* use listing APIs to reconcile remote items
* subscribe to change events and update Dexie accordingly

remoteStorage.js is designed for local browser storage plus sync, and `BaseClient` is the main endpoint for listing, reading, creating, updating, deleting, and handling change events. ([remoteStorage][4])

---

# Core features

## 1) Capture photo

Implement a photo capture flow using `navigator.mediaDevices.getUserMedia()` for camera access. This API is available in secure contexts and prompts the user for camera permission. ([MDN Web Docs][1])

Flow:

1. start camera preview
2. let user take a photo
3. render frame to canvas
4. create a Blob
5. inspect original dimensions
6. resize/compress locally
7. try to get geolocation
8. generate metadata
9. write local Dexie record
10. save file to remoteStorage
11. save metadata JSON to remoteStorage
12. mark sync state accordingly

## 2) Gallery view

Implement a gallery grid:

* load from Dexie
* show thumbnail
* show display name or fallback generated label
* newest first
* show unsynced/error badges
* tap opens detail screen

## 3) Detail view

Display:

* media preview
* editable name
* width and height
* file size
* mime type
* createdAt / updatedAt
* GPS lat/lng and accuracy
* sync status
* delete action

## 4) Rename

Allow editing `name` in the detail view and optionally inline in gallery.

Rules:

* update Dexie immediately
* mark sync as pending
* sync updated metadata JSON
* do not move or rename the file path

## 5) Delete

Use **soft delete** first.

Flow:

1. set `deletedAt`
2. hide from UI immediately
3. sync tombstone/delete metadata
4. delete remote file/object if appropriate
5. optionally purge local records after successful sync

---

# Photo processing requirements

Implement a utility pipeline:

* `capturePhotoBlob()`
* `getImageDimensions(blob)`
* `resizeImageBlob(blob, { maxDimension, quality, mimeType })`
* `generateThumbnail(blob)`
* `formatBytes(bytes)`

Use browser image APIs such as `createImageBitmap` and canvas-based resizing.

Rules:

* preserve aspect ratio
* no upscaling
* default output max dimension: 1920
* default quality: 0.8
* store final dimensions and byte size in metadata

---

# Geolocation requirements

Implement:

* `getCurrentLocation(): Promise<GpsMetadata | null>`

Rules:

* request geolocation permission only when needed
* do not fail capture if denied/unavailable
* save `gps: null` when not available

---

# Video support

Design for future video support, but make it optional in v1.

If implemented:

* use `getUserMedia()` for stream access
* use `MediaRecorder` for recording
* store kind = `video`
* generate duration
* generate poster thumbnail if practical

The MediaRecorder API is the standard browser API for recording media streams. ([MDN Web Docs][5])

If time is limited, leave video behind a feature flag or stub.

---

# UI requirements

## Capture screen

* camera preview
* capture button
* camera switch if supported
* permission state messages
* save progress state
* optional location status

## Gallery screen

* responsive grid
* image thumbnails
* name below thumbnail
* unsynced badge
* empty state
* pull-to-refresh or refresh button optional

## Detail screen

* large preview
* editable title field
* metadata list
* delete button
* sync status indicator

## Settings screen

* remoteStorage connection status
* image quality settings
* max dimension setting
* optional toggle for GPS capture
* storage/debug info

---

# Required services/modules

Implement these modules:

## `db.ts`

* Dexie setup
* schema
* typed queries

## `remoteStorage.ts`

* remoteStorage initialization
* scope/module client creation
* connect/sync helpers
* change listeners

## `mediaCapture.ts`

* start/stop camera
* capture still image
* optional video recording hooks

## `imageProcessing.ts`

* resize
* thumbnail generation
* metadata extraction

## `location.ts`

* geolocation wrapper

## `mediaRepository.ts`

High-level operations:

* `createMediaItem()`
* `listMediaItems()`
* `getMediaItem(id)`
* `renameMediaItem(id, name)`
* `softDeleteMediaItem(id)`
* `syncMediaItem(id)`
* `reconcileRemoteChanges()`

## `routes/*`

TanStack Router route definitions and loaders

---

# Sync behavior

Implement a thin sync layer between Dexie and remoteStorage.

Rules:

* Dexie is the fast local query source
* remoteStorage is the remote sync/persistence layer
* local writes happen first
* sync retries later if offline/failing
* remote change events reconcile into Dexie

Track sync state:

* `pending`
* `synced`
* `error`

Support:

* initial local load
* eventual remote reconciliation
* retry failed syncs
* tombstone handling for deletes

---

# Error handling

Handle these cases explicitly:

* camera permission denied
* geolocation permission denied
* remoteStorage not connected yet
* offline during save
* blob save succeeded but metadata save failed
* metadata save succeeded but file save failed
* quota/storage pressure
* corrupt or missing local thumbnail
* stale sync status after restart

Implement user-visible states instead of silent failures.

---

# PWA requirements

Add:

* `manifest.webmanifest`
* icons
* service worker
* offline app shell caching

The app must still function without installation. PWA mode is an enhancement, not a prerequisite.

---

# Non-goals for v1

Do not implement:

* albums
* search
* tagging
* EXIF parsing/editing
* map UI
* server backend
* advanced conflict resolution
* collaborative editing
* full original+resized dual-storage pipeline
* video transcoding

---

# Implementation order

Build in this order:

1. scaffold Vite + React + TypeScript app
2. add TanStack Router
3. add Dexie and define schema
4. add remoteStorage.js setup
5. build gallery route reading from Dexie
6. build capture route with camera preview
7. capture photo to Blob
8. resize/compress photo
9. save local MediaItem in Dexie
10. save file + metadata to remoteStorage
11. add detail route
12. add rename
13. add soft delete
14. add sync badges/status
15. add service worker + manifest
16. add optional geolocation
17. add optional video support behind flag

---

# Acceptance criteria

The implementation is done when:

* app runs in browser over HTTPS/localhost
* user can capture a photo
* photo is resized before save
* metadata is persisted locally
* gallery works offline
* detail view shows name, dimensions, size, GPS, mime type, timestamps
* user can rename an item
* user can delete an item
* remoteStorage sync works for file + metadata
* app is installable as a PWA
* codebase is typed and reasonably modular

---

# Coding expectations

* Use strict TypeScript
* Prefer small composable modules
* Keep UI components simple
* Avoid global mutable state unless necessary
* Use async/await consistently
* Add comments only where logic is non-obvious
* Keep storage and sync logic out of presentational components

---

If you want, I can also convert this into a tighter **“single prompt for Claude/Codex/GPT”** version with less prose and more imperative instructions.

[1]: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia?utm_source=chatgpt.com "MediaDevices: getUserMedia () method - Web APIs | MDN"
[2]: https://remotestorage.io/rs.js/docs/api/baseclient/classes/BaseClient.html?utm_source=chatgpt.com "Class: BaseClient | remoteStorage.js"
[3]: https://tanstack.com/router/latest/docs/overview?utm_source=chatgpt.com "Overview | TanStack Router Docs"
[4]: https://remotestorage.io/rs.js/docs/?utm_source=chatgpt.com "Documentation | remoteStorage.js"
[5]: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder?utm_source=chatgpt.com "MediaRecorder - Web APIs | MDN"
