import type { BlogIndex, BlogIndexEntry, BlogPostMeta } from './types'

function splitIdDateAndSlug(id: string): { date: string; slug: string } {
  const datePart = id.slice(0, 10)
  const slugPart = id.slice(11)
  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(datePart)

  return {
    date: hasDate ? datePart : '',
    slug: slugPart || id,
  }
}

export function createEmptyIndex(title = 'My Blog', now = new Date().toISOString()): BlogIndex {
  return {
    version: 2,
    title,
    updatedAt: now,
    posts: [],
  }
}

export function toIndexEntry(meta: BlogPostMeta, contentUrl: string): BlogIndexEntry {
  if (!meta.publishedAt) {
    throw new Error(`Post ${meta.id} has no publishedAt timestamp`)
  }

  const { date, slug } = splitIdDateAndSlug(meta.id)

  return {
    id: meta.id,
    slug,
    date,
    title: meta.title,
    excerpt: meta.excerpt,
    publishedAt: meta.publishedAt,
    updatedAt: meta.updatedAt,
    contentUrl,
  }
}

export function sortPostsDescendingByPublishedAt(posts: BlogIndexEntry[]): BlogIndexEntry[] {
  return [...posts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

export function upsertIndexEntry(index: BlogIndex, entry: BlogIndexEntry, now = new Date().toISOString()): BlogIndex {
  const filtered = index.posts.filter((post) => post.id !== entry.id)
  const posts = sortPostsDescendingByPublishedAt([...filtered, entry])

  return {
    ...index,
    updatedAt: now,
    posts,
  }
}

export function removeIndexEntry(index: BlogIndex, postId: string, now = new Date().toISOString()): BlogIndex {
  return {
    ...index,
    updatedAt: now,
    posts: index.posts.filter((post) => post.id !== postId),
  }
}

export function publishMeta(meta: BlogPostMeta, now = new Date().toISOString()): BlogPostMeta {
  return {
    ...meta,
    status: 'published',
    publishedAt: meta.publishedAt ?? now,
    updatedAt: now,
    deletedAt: null,
  }
}

export function unpublishMeta(meta: BlogPostMeta, now = new Date().toISOString()): BlogPostMeta {
  return {
    ...meta,
    status: 'unpublished',
    updatedAt: now,
  }
}

export function markMetaDeleted(meta: BlogPostMeta, now = new Date().toISOString()): BlogPostMeta {
  return {
    ...meta,
    status: 'deleted',
    updatedAt: now,
    deletedAt: now,
  }
}

export function rebuildIndexFromPublishedMeta(
  metaRecords: BlogPostMeta[],
  contentUrlById: (id: string) => string | null,
  title = 'My Blog',
  now = new Date().toISOString(),
): BlogIndex {
  const posts = metaRecords
    .filter((meta) => meta.status === 'published')
    .filter((meta) => Boolean(meta.publishedAt))
    .map((meta) => {
      const contentUrl = contentUrlById(meta.id)
      return contentUrl ? toIndexEntry(meta, contentUrl) : null
    })
    .filter((entry): entry is BlogIndexEntry => entry !== null)

  return {
    version: 2,
    title,
    updatedAt: now,
    posts: sortPostsDescendingByPublishedAt(posts),
  }
}

interface JsonFeedItem {
  id: string
  url: string
  title: string
  summary: string
  date_published: string
  date_modified: string
}

interface JsonFeedV1 {
  version: 'https://jsonfeed.org/version/1.1'
  title: string
  feed_url?: string
  items: JsonFeedItem[]
}

export function toJsonFeed(index: BlogIndex, feedUrl?: string): JsonFeedV1 {
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: index.title,
    ...(feedUrl ? { feed_url: feedUrl } : {}),
    items: index.posts.map((post) => ({
      id: post.id,
      url: post.contentUrl,
      title: post.title,
      summary: post.excerpt,
      date_published: post.publishedAt,
      date_modified: post.updatedAt,
    })),
  }
}
