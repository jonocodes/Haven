# Implementation Checklist

## High Priority

- [x] Scaffold Vite + React + TypeScript app
- [x] Add TanStack Router with routes: /, /capture, /gallery, /media/$mediaId, /settings
- [x] Add Dexie and define schema (mediaItems table)
- [x] Add remoteStorage.js setup with media scope
- [x] Build gallery route reading from Dexie
- [x] Build capture route with camera preview using getUserMedia
- [x] Implement photo capture to Blob with canvas rendering
- [x] Implement resize/compress pipeline (max 1920px, 0.8 quality)
- [x] Implement thumbnail generation
- [x] Implement mediaRepository: create, list, get, rename, softDelete, sync
- [x] Save MediaItem to Dexie on capture
- [x] Save file + metadata to remoteStorage
- [x] Build detail route with metadata display
- [x] Implement rename (update Dexie + remoteStorage, don't move file)
- [x] Implement soft delete with tombstone handling

## Medium Priority

- [x] Implement geolocation wrapper (optional, non-blocking)
- [x] Add sync badges/status indicators in gallery
- [x] Build settings screen (RS connection, quality, max dimension, GPS toggle)
- [ ] Add PWA manifest and service worker

## Low Priority

- [ ] Add video support behind feature flag (optional)
