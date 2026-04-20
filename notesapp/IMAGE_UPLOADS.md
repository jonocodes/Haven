# Image Uploads Plan

Allow images to be pasted or dragged into notes and stored in remoteStorage, rendered inline in the markdown editor.

## Background

The editor (`MarkdownEditor.tsx`) already uses `imageField()` from `codemirror-live-markdown`, which renders standard HTTP/blob URLs in markdown image syntax. It does not support a custom URL resolver — only a `basePath` string prefix.

Images in remoteStorage are binary blobs that require an async fetch to produce a loadable URL. This requires a transform layer between stored form and display form.

## URL Strategy

**Canonical form** (stored in note body, synced via remoteStorage):
```
![alt text](rs-image://uuid.ext)
```

**Display form** (passed to the editor at runtime):
```
![alt text](blob:http://localhost:5173/abc123...)
```

Blob URLs are ephemeral — they are created per session and cached in memory. The canonical form is always what gets written to the database and synced.

## File Changes

### 1. `src/lib/remotestorage.ts`

Add image storage functions alongside existing note functions:

```ts
const IMAGES_PATH = "common/images/"

async function pushImageFile(id: string, mimeType: string, data: ArrayBuffer): Promise<void>
async function pullImageAsBlob(id: string): Promise<Blob | null>
async function deleteImage(id: string): Promise<void>
```

- `pushImageFile` stores binary at `common/images/{id}` using `client().storeFile(mimeType, path, data)`
- `pullImageAsBlob` fetches with `client().getFile(path)` and wraps the result in a `Blob`
- `deleteImage` calls `client().remove(path)`

### 2. `src/lib/images.ts` (new file)

Manages upload, URL resolution, and in-memory caching.

```ts
export const RS_IMAGE_SCHEME = 'rs-image://'

// In-memory caches (cleared on page reload)
const blobUrlCache = new Map<string, string>()    // canonical -> blob URL
const reverseCache = new Map<string, string>()    // blob URL -> canonical

export async function uploadImage(file: File): Promise<string>
export async function fetchBlobUrl(canonicalUrl: string): Promise<string>
export async function resolveBodyUrls(body: string): Promise<string>
export function canonicalizeBody(body: string): string
```

**`uploadImage(file)`**
1. Generate a UUID + preserve file extension
2. Read file as `ArrayBuffer`
3. Call `pushImageFile(id, file.type, buffer)`
4. Return `rs-image://uuid.ext`

**`fetchBlobUrl(canonicalUrl)`**
1. Return cached blob URL if present
2. Parse the id from `rs-image://uuid.ext`
3. Call `pullImageAsBlob(id)`
4. Create blob URL with `URL.createObjectURL(blob)`
5. Store in both caches, return blob URL

**`resolveBodyUrls(body)`**
1. Find all `rs-image://...` patterns in the body
2. Fetch blob URLs for any not yet cached (in parallel)
3. Return body with all canonical URLs replaced by blob URLs

**`canonicalizeBody(body)`**
1. Find all `blob:...` URLs in the body using the reverse cache
2. Replace each with its canonical `rs-image://` form
3. Return the canonical body (synchronous — reverse cache is always populated if blob URL exists)

### 3. `src/components/MarkdownEditor.tsx`

Add prop:
```ts
onImageUpload?: (file: File) => Promise<string>
```

Add event handlers on the container `<div>`:

**Paste handler:**
```ts
onPaste={(e) => {
  const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'))
  if (files.length === 0 || !onImageUpload) return
  e.preventDefault()
  for (const file of files) {
    onImageUpload(file).then(canonicalUrl => {
      insertAtCursor(view, `![image](${canonicalUrl})`)
    })
  }
}}
```

**Drop handler:**
```ts
onDrop={(e) => {
  const files = Array.from(e.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'))
  if (files.length === 0 || !onImageUpload) return
  e.preventDefault()
  for (const file of files) {
    onImageUpload(file).then(canonicalUrl => {
      insertAtCursor(view, `![image](${canonicalUrl})`)
    })
  }
}}
```

**`insertAtCursor(view, text)`** — helper that dispatches a CodeMirror transaction inserting text at the current cursor position.

Note: The editor receives canonical URLs from `onImageUpload` and inserts them into the doc. The display transform in `NoteEditor` will resolve them on the next render.

### 4. `src/components/NoteEditor.tsx`

Add `displayBody` state and image upload handler.

**New state:**
```ts
const [displayBody, setDisplayBody] = useState('')
```

**Effect — resolve image URLs when body changes:**
```ts
useEffect(() => {
  resolveBodyUrls(body).then(setDisplayBody)
}, [body])
```

**Image upload handler:**
```ts
async function handleImageUpload(file: File): Promise<string> {
  const canonicalUrl = await uploadImage(file)
  // Warm the blob URL cache so next resolveBodyUrls call is instant
  await fetchBlobUrl(canonicalUrl)
  return canonicalUrl
}
```

**Editor wiring:**
```tsx
<MarkdownEditor
  value={displayBody}                      // was: body
  onImageUpload={handleImageUpload}
  onChange={(val) => {
    const canonical = canonicalizeBody(val) // strip blob URLs back to rs-image://
    setBody(canonical)
    currentBodyRef.current = canonical
    saveBody(canonical)
  }}
  ...
/>
```

## Data Flow

```
Upload:
  file → uploadImage() → rs-image://uuid.ext inserted into editor
       → editor onChange → canonicalizeBody (no-op, already canonical)
       → saveBody → applyBodyUpdate → stored in RxDB → synced to remoteStorage

Display:
  body from RxDB → resolveBodyUrls() → blob URLs fetched from remoteStorage
  → displayBody → MarkdownEditor → imageField() renders <img src="blob:...">

Sync (incoming remote change):
  new body from remoteStorage → RxDB → note.body update → useEffect resolves URLs → displayBody updated
```

## Out of Scope (for now)

- **Orphan cleanup**: deleting a note does not delete its images from remoteStorage
- **Offline cache**: blob URLs are lost on page reload; images re-fetch from remoteStorage each session
- **Size validation**: no file size limit enforced; depends on remoteStorage backend
- **Multiple images in one paste**: supported (loop over files array)
