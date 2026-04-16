# Haven Phone App

An offline-first media capture web app built with React, TypeScript, Vite, TanStack Router, Dexie, and remoteStorage.js.

## Features

- Capture photos with camera preview
- Automatic resize/compression (max 1920px, 0.8 quality)
- Thumbnail generation
- GPS geolocation tagging (optional)
- Gallery view with sync status badges
- Media detail view with metadata display
- Rename and soft-delete media items
- RemoteStorage.js sync for cross-device storage
- Works as installable PWA

## Tech Stack

- **React** + **TypeScript** + **Vite**
- **TanStack Router** for client-side routing
- **Dexie** for IndexedDB (local storage)
- **remoteStorage.js** for remote sync
- **PWA** with service worker

## Routes

- `/` → redirects to `/gallery`
- `/capture` → Camera capture screen
- `/gallery` → Photo gallery grid
- `/media/$mediaId` → Media detail view
- `/settings` → App settings

## Scripts

```bash
npm install     # Install dependencies
npm run dev     # Start dev server
npm run build   # Build for production
npm run lint    # Run ESLint
npm run preview # Preview production build
```

## Environment

This app requires a secure context (HTTPS or localhost) for camera access via `getUserMedia()`.

## RemoteStorage

The app syncs media to remoteStorage servers. Users connect their own storage at runtime. Configure in settings once a remoteStorage account is connected.
