# Image Uploads V2 (Hybrid Portable Paths + remoteStorage Backing)

This is a hybrid approach that combines:

1. **Portable markdown links** that work outside the app (`./assets/...`), and
2. **remoteStorage-backed binary sync** for pasted/dropped images.

## Goals

- Markdown should remain readable in normal tools after download.
- Images should sync through remoteStorage with the rest of note data.
- Editor should still render images inline while editing.

## Canonical URL Strategy

Canonical URL stored in note body:

```md
![alt](./assets/uuid.ext)
```

Display URL used at runtime inside the editor:

```md
![alt](blob:http://localhost:5173/...)
```

`blob:` URLs are ephemeral and replaced back to canonical relative paths before persistence.

## Storage Mapping

- Canonical markdown path: `./assets/<id>`
- remoteStorage object path: `common/assets/<id>`
- `<id>` currently uses `uuid + extension`

## Data Flow

### Upload (paste/drop)

1. User pastes or drags an image into editor.
2. App uploads file bytes to `common/assets/<id>` in remoteStorage.
3. App inserts `![image](./assets/<id>)` at cursor.
4. Note body saves canonical markdown text.

### Display

1. Note body is read from DB in canonical form.
2. Runtime resolver finds `./assets/...` links.
3. Resolver fetches corresponding bytes from remoteStorage.
4. Resolver creates blob URL and rewrites editor value for display.

### Save

1. Editor may contain blob URLs after rendering.
2. Save path canonicalizes body by replacing known blob URLs back to `./assets/...`.
3. Canonical body is persisted and synced.

## Initial Implementation Scope

- [x] Add image binary helpers in `src/lib/remotestorage.ts`
- [x] Add `src/lib/images.ts` helper module
- [x] Add paste/drop upload support in `src/components/MarkdownEditor.tsx`
- [x] Integrate body resolve/canonicalize pipeline in `src/components/NoteEditor.tsx`

## Remaining Work

- [ ] Add orphan cleanup when notes/images are deleted
- [ ] Add export workflow that downloads markdown + `assets/` files together
- [ ] Add import reconciliation for markdown with existing local `./assets/...` links
- [ ] Add image size/type validation and user-facing errors
- [ ] Add tests for resolver/canonicalization edge-cases
