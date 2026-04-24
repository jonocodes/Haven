# Loam

A minimal digital garden editor. Posts and metadata live in your own remoteStorage under `/public/loam/`.

## Quick start

```bash
bun install
bun run dev
```

Open the local URL shown by Vite (usually `http://localhost:5173`).

## Routes

| Path | Description |
|---|---|
| `/` | Landing page |
| `/write` | Editor (requires remoteStorage connection) |
| `/p/{freetext}/{token}` | Public garden home page |
| `/p/{freetext}/{token}/{postId}` | Public post page |
| `/public/:id` | Public post page (query param: `?index=<url>`) |

The `{token}` is a base64url-encoded index URL. The `{freetext}` prefix is ignored by the router and exists for human readability (e.g. `/p/yourname/aHR0cH…`). If no URL prefix is set in Settings, `garden` is used as the default freetext.

## Editor features

- remoteStorage connect/disconnect via widget
- Post list with draft/published/unpublished status
- Markdown editor with live styling (CodeMirror)
- Auto title/excerpt parsing from markdown
- Actions: Save draft, Publish, Unpublish, Delete
- Settings page: site title, tagline, URL prefix, Rebuild index
- JSON Feed (`feed.json`) generated alongside `index.json`

## Settings

Accessible at `/write` via the Settings tab.

| Setting | Description |
|---|---|
| Site title | Displayed on the public home page and used as the HTML `<title>` |
| Tagline | Subtitle shown below the title on the public home page |
| URL prefix | Human-readable segment added before the encoded token in public URLs |

Settings are stored in `settings/garden.json` (private) and title/tagline/urlPrefix are also written into the public `index.json`.

## Storage layout

```
/loam/                          ← private remoteStorage module
  meta/<id>.json                ← post metadata
  settings/garden.json          ← site settings

/public/loam/                   ← public remoteStorage scope
  index.json                    ← published post listing
  feed.json                     ← JSON Feed 1.1
  posts/<id>.md                 ← post markdown
```

## Post ID format

Posts use date-prefixed slugs:

- Format: `YYYY-MM-DD-title-slug`
- Example: `2026-04-22-getting-started`
- Collisions get a numeric suffix: `2026-04-22-getting-started-2`

## Schemas

### `index.json`

```json
{
  "version": 2,
  "title": "My Garden",
  "tagline": "Notes from the field",
  "urlPrefix": "yourname",
  "updatedAt": "2026-04-22T12:00:00Z",
  "posts": [
    {
      "id": "2026-04-22-getting-started",
      "slug": "getting-started",
      "date": "2026-04-22",
      "title": "Getting Started",
      "excerpt": "A short summary",
      "publishedAt": "2026-04-22T11:00:00Z",
      "updatedAt": "2026-04-22T12:00:00Z",
      "contentUrl": "https://<storage-host>/public/loam/posts/2026-04-22-getting-started.md"
    }
  ]
}
```

### `meta/<id>.json`

```json
{
  "version": 1,
  "id": "2026-04-22-getting-started",
  "title": "Getting Started",
  "excerpt": "A short summary",
  "status": "published",
  "createdAt": "2026-04-22T10:00:00Z",
  "updatedAt": "2026-04-22T12:00:00Z",
  "publishedAt": "2026-04-22T11:00:00Z",
  "deletedAt": null
}
```

`status` is one of: `draft`, `published`, `unpublished`, `deleted`.

## Post state machine

```
draft ──Publish──> published
published ──Unpublish──> unpublished
unpublished ──Publish──> published
draft|published|unpublished ──Delete──> deleted
```

## Rebuild index

Rebuild scans all `meta/*.json` records, keeps those with `status === "published"` and an existing markdown file, and rewrites `index.json` and `feed.json` from scratch. Use this after editing files outside the app. Title, tagline, and URL prefix are preserved from the existing index.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `VITE_RS_MODULE` | `loam` | remoteStorage module name and private scope |
| `VITE_PUBLIC_DIR` | same as `VITE_RS_MODULE` | Public scope directory name |
| `VITE_DROPBOX_APP_KEY` | — | Enables Dropbox backend |
| `VITE_GOOGLE_CLIENT_ID` | — | Enables Google Drive backend |

## 401 troubleshooting

If you get `401` errors reading or writing:

- The app claims the `loam` module by default. Make sure your remoteStorage token grants access to it.
- If your data lives under a different public directory, set `VITE_PUBLIC_DIR=<your-dir>`.
- If your module name should differ, set `VITE_RS_MODULE=<your-module>`.
- Reconnect via the remoteStorage widget after changing env vars.

## Core invariant

The index is the only way readers discover posts. A post can exist as files without appearing publicly until it is published and the index is updated.
