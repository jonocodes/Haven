# Blog App (remoteStorage + public content)

A minimal blog engine where posts and metadata live in remoteStorage under `/public/`.

## Quick start

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite (usually `http://localhost:5173`).

This package now includes a minimal React + Vite runtime scaffold (similar baseline stack to `notesapp`) plus the blog core library modules.


## Current writer UI capabilities

The app now includes a simple writer interface with:

- remoteStorage.js widget-based connect/disconnect
- post list panel (metadata-backed)
- markdown editor + title/excerpt fields
- auto title/excerpt parsing from markdown (notesapp-style first H1 parsing)
- explicit actions: Save draft, Publish, Unpublish, Delete, Rebuild index
- open links for public index, public render route (`/p/:id`), and raw markdown

This is intentionally minimal and now uses shadcn-style UI primitives (Button/Input/Textarea/Card) for widgets.

## Goals

- Keep authoring simple: markdown files can be edited directly from a mounted remoteStorage public directory.
- Keep app logic simple: no CRDT, no ntfy alerts, no collaboration merge logic.
- Keep publishing explicit: discovery comes from `index.json`.

## Storage layout

All public blog artifacts are under one namespace:

- `public/blog/posts/<id>.md` — markdown body (source of truth for content)
- `public/blog/meta/<id>.json` — structured metadata for each post
- `public/blog/index.json` — published post listing for discovery


## ID strategy (slug-first)

Use blog-friendly slugs for post ids rather than UUIDs.

- Preferred id format: `YYYY-MM-DD-title-slug`
- Example: `2026-04-22-remote-storage-notes`
- If there is a collision, append a numeric suffix (`-2`, `-3`, ...).

This keeps URLs readable and still avoids collisions without introducing opaque identifiers.

## Example directory structure

Yes — with this strategy, the markdown file name uses the post id, and the post id is the slug-style id.

```text
public/
  blog/
    index.json
    posts/
      2026-04-22-remote-storage-notes.md
      2026-04-22-remote-storage-notes-2.md
      2026-04-18-intro.md
    meta/
      2026-04-22-remote-storage-notes.json
      2026-04-22-remote-storage-notes-2.json
      2026-04-18-intro.json
```

The markdown and metadata share the same id stem.

## Example public post URLs

A post id like `2026-04-22-remote-storage-notes` can be visited in two common ways:

1. **Reader app route** (recommended UX):

   `https://blog.example.com/p/2026-04-22-remote-storage-notes`

2. **Direct public file URL** (raw markdown object in remoteStorage):

   `https://<storage-host>/public/blog/posts/2026-04-22-remote-storage-notes.md`

The exact `<storage-host>` depends on the user's remoteStorage provider.

## Future discovery goals

To keep the initial system zero-backend, prefer explicit `base` URL parameters first.

Future optional enhancements:

- **WebFinger discovery**: resolve `acct:user@domain` to a blog public base URL.
- **DNS TXT discovery/verification**: publish blog base metadata in DNS for portability/trust.
- **Resolution precedence**: define deterministic order across `base`, WebFinger, and DNS TXT.

## Core invariant

The index is the only way readers discover posts. A post can exist as files without being in the public index.

## Post metadata schema (`public/blog/meta/<id>.json`)

```json
{
  "version": 1,
  "id": "2026-04-22-my-post",
  "title": "My Post",
  "excerpt": "One-line summary",
  "status": "draft",
  "createdAt": "2026-04-22T10:00:00Z",
  "updatedAt": "2026-04-22T10:00:00Z",
  "publishedAt": null,
  "deletedAt": null
}
```

`status` is one of:

- `draft`
- `published`
- `unpublished`
- `deleted`

## Index schema (`public/blog/index.json`)

```json
{
  "version": 1,
  "title": "My Blog",
  "updatedAt": "2026-04-22T12:00:00Z",
  "posts": [
    {
      "id": "2026-04-22-my-post",
      "title": "My Post",
      "excerpt": "One-line summary",
      "publishedAt": "2026-04-22T11:00:00Z",
      "updatedAt": "2026-04-22T12:00:00Z"
    }
  ]
}
```

## State machine

- `draft --Publish--> published`
- `published --Unpublish--> unpublished`
- `unpublished --Publish--> published`
- `draft|published|unpublished --Delete--> deleted`
- `deleted` has no transitions

## Button behavior

### Publish

1. Read `meta/<id>.json`.
2. Verify `posts/<id>.md` exists.
3. Set metadata:
   - `status = "published"`
   - `publishedAt = publishedAt ?? now`
   - `updatedAt = now`
4. Save metadata.
5. Upsert post summary into `index.json`.
6. Sort index posts by `publishedAt` descending.
7. Save `index.json` with `updatedAt = now`.

### Unpublish

1. Read metadata.
2. Set `status = "unpublished"`, `updatedAt = now`.
3. Save metadata.
4. Remove post from `index.json.posts`.
5. Save `index.json` with `updatedAt = now`.

### Delete

1. Confirm destructive action.
2. Delete `posts/<id>.md`.
3. Delete `meta/<id>.json` (or set `status = "deleted"` if soft-delete is desired).
4. Remove post from `index.json.posts`.
5. Save `index.json` with `updatedAt = now`.

## Rebuild index (for external/offline edits)

Because posts can be edited outside the app, include a rebuild operation:

1. List `meta/*.json`.
2. Keep records with `status === "published"` and existing `posts/<id>.md`.
3. Map to index summary entries.
4. Sort by `publishedAt` descending.
5. Rewrite `index.json` from scratch.

This operation is the safety net for drift between hand-edited files and the index.

## Suggested TypeScript interfaces

```ts
export type PostStatus = 'draft' | 'published' | 'unpublished' | 'deleted'

export interface BlogPostMeta {
  version: 1
  id: string
  title: string
  excerpt: string
  status: PostStatus
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  deletedAt: string | null
}

export interface BlogIndexEntry {
  id: string
  title: string
  excerpt: string
  publishedAt: string
  updatedAt: string
}

export interface BlogIndex {
  version: 1
  title: string
  updatedAt: string
  posts: BlogIndexEntry[]
}
```

## Suggested function signatures

```ts
export async function publishPost(id: string): Promise<void>
export async function unpublishPost(id: string): Promise<void>
export async function deletePost(id: string): Promise<void>
export async function rebuildIndex(): Promise<void>
```

## 401 troubleshooting (remoteStorage)

If you get `401` while reading/writing the blog directory:

- Ensure your app module claim and directory match. This app now defaults to:
  - module claim: `blog-app`
  - public scope: `/public/blog-app/`
- If your data already lives under another public dir (for example from an earlier app), set:
  - `VITE_PUBLIC_BLOG_DIR=<your-existing-dir>`
- If your module name should differ, set:
  - `VITE_RS_MODULE=<your-module-name>`
- Reconnect via remoteStorage widget after changing env vars.

In most cases this is an authorization/scope mismatch (or a stale token), not CORS.

## Suggested next imports from notesapp

Beyond markdown parsing, the highest-value features to port are:

- CodeMirror editor plugins (already added): live markdown styling/link behavior and code block language highlighting.
- Image paste/drop upload hooks in the editor.
- Read-only public post viewer route that can load from a `?src=` URL.
- Lightweight sync status indicator in the author UI.


## Public post rendering

Published posts can be opened through a render route:

- `/p/:id?base=<public-base-url>`

There is also a public home/index page route:

- `/public?base=<public-base-url>`

The `base` parameter is shared across home and post URLs and points to the blog public directory (not an individual markdown file).
