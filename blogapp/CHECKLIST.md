# Blog App Implementation Checklist

## Foundation
- [x] Define canonical public storage layout (`posts`, `meta`, `index`).
- [x] Define shared TypeScript types for metadata and index.
- [x] Add a minimal TypeScript + Vitest project scaffold.

## Core publish/index logic
- [x] Implement pure helpers for index upsert/remove/sort behavior.
- [x] Implement state transitions for publish/unpublish/delete.
- [x] Implement `rebuildIndex` from metadata + markdown existence checks.
- [x] Add id normalization + slug/id generation helpers.

## remoteStorage integration
- [x] Add remoteStorage client scoped to `/public/blog/`.
- [x] Implement read/write/remove functions for markdown, metadata, and index.
- [ ] Add optimistic concurrency strategy for index writes.
- [ ] Add conflict/retry handling for multi-device updates.

## App surface (next)
- [ ] Build post list view from `index.json`.
- [ ] Build editor for markdown + metadata JSON fields.
- [ ] Add separate Publish / Unpublish / Delete buttons.
- [ ] Add Rebuild Index button.

## Quality
- [x] Add unit tests for publish/unpublish/delete/rebuild behavior.
- [ ] Add integration tests with mocked remoteStorage API.
- [ ] Add e2e tests for full publish workflow.

## Discovery/identity (future)
- [ ] Add optional WebFinger handle resolution (`acct:user@domain`) to discover a blog public base URL.
- [ ] Add optional DNS TXT-based discovery/verification as a fallback or trust signal.
- [ ] Define precedence rules when `base` URL, WebFinger, and DNS TXT all exist.
