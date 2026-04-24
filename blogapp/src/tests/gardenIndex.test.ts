import { describe, expect, it } from 'vitest'
import {
  createEmptyIndex,
  markMetaDeleted,
  publishMeta,
  rebuildIndexFromPublishedMeta,
  removeIndexEntry,
  toJsonFeed,
  unpublishMeta,
  upsertIndexEntry,
} from '../lib/gardenIndex'
import type { GardenPostMeta } from '../lib/types'

describe('garden index helpers', () => {
  const baseMeta: GardenPostMeta = {
    version: 1,
    id: '2026-04-22-post-1',
    title: 'Post 1',
    excerpt: 'Excerpt 1',
    status: 'draft',
    createdAt: '2026-04-22T10:00:00Z',
    updatedAt: '2026-04-22T10:00:00Z',
    publishedAt: null,
    deletedAt: null,
  }

  it('publishes metadata with publishedAt defaulting to now', () => {
    const published = publishMeta(baseMeta, '2026-04-22T12:00:00Z')
    expect(published.status).toBe('published')
    expect(published.publishedAt).toBe('2026-04-22T12:00:00Z')
  })

  it('unpublishes metadata', () => {
    const published = publishMeta(baseMeta, '2026-04-22T12:00:00Z')
    const unpublished = unpublishMeta(published, '2026-04-22T13:00:00Z')
    expect(unpublished.status).toBe('unpublished')
    expect(unpublished.updatedAt).toBe('2026-04-22T13:00:00Z')
  })

  it('marks metadata as deleted', () => {
    const deleted = markMetaDeleted(baseMeta, '2026-04-22T14:00:00Z')
    expect(deleted.status).toBe('deleted')
    expect(deleted.deletedAt).toBe('2026-04-22T14:00:00Z')
  })

  it('upserts and removes index entries', () => {
    const index = createEmptyIndex('Blog', '2026-04-22T10:00:00Z')

    const withFirst = upsertIndexEntry(
      index,
      {
        id: '2026-04-22-post-1',
        slug: 'post-1',
        date: '2026-04-22',
        title: 'Post 1',
        excerpt: 'First',
        publishedAt: '2026-04-22T12:00:00Z',
        updatedAt: '2026-04-22T12:00:00Z',
        contentUrl: 'https://example.com/post-1.md',
      },
      '2026-04-22T12:01:00Z',
    )

    expect(withFirst.posts).toHaveLength(1)

    const removed = removeIndexEntry(withFirst, '2026-04-22-post-1', '2026-04-22T12:02:00Z')
    expect(removed.posts).toHaveLength(0)
  })

  it('exports JSON Feed 1.1 from index entries', () => {
    const index = createEmptyIndex('Blog', '2026-04-22T10:00:00Z')
    const withPost = upsertIndexEntry(index, {
      id: '2026-04-22-post-1',
      slug: 'post-1',
      date: '2026-04-22',
      title: 'Post 1',
      excerpt: 'First',
      publishedAt: '2026-04-22T12:00:00Z',
      updatedAt: '2026-04-22T12:00:00Z',
      contentUrl: 'https://example.com/post-1.md',
    })

    const feed = toJsonFeed(withPost, 'https://example.com/feed.json')
    expect(feed.version).toBe('https://jsonfeed.org/version/1.1')
    expect(feed.feed_url).toBe('https://example.com/feed.json')
    expect(feed.items[0].url).toBe('https://example.com/post-1.md')
  })

  it('rebuilds index from published metadata only and checks content URL existence', () => {
    const publishedOne = publishMeta(baseMeta, '2026-04-22T12:00:00Z')
    const publishedTwo = publishMeta(
      {
        ...baseMeta,
        id: '2026-04-22-post-2',
        title: 'Post 2',
        excerpt: 'Second',
      },
      '2026-04-22T11:00:00Z',
    )
    const draft = { ...baseMeta, id: '2026-04-22-post-3', status: 'draft' as const }

    const rebuilt = rebuildIndexFromPublishedMeta(
      [publishedOne, publishedTwo, draft],
      (id) => (id === '2026-04-22-post-2' ? null : `https://example.com/${id}.md`),
      'Blog',
      undefined,
      undefined,
      '2026-04-22T15:00:00Z',
    )

    expect(rebuilt.posts).toHaveLength(1)
    expect(rebuilt.posts[0].id).toBe('2026-04-22-post-1')
    expect(rebuilt.posts[0].slug).toBe('post-1')
    expect(rebuilt.posts[0].date).toBe('2026-04-22')
    expect(rebuilt.updatedAt).toBe('2026-04-22T15:00:00Z')
  })
})
