import type { BlogIndex, BlogIndexEntry, BlogPostMeta } from './types'

export function createEmptyIndex(title = 'My Blog', now = new Date().toISOString()): BlogIndex {
  return {
    version: 1,
    title,
    updatedAt: now,
    posts: [],
  }
}

export function toIndexEntry(meta: BlogPostMeta): BlogIndexEntry {
  if (!meta.publishedAt) {
    throw new Error(`Post ${meta.id} has no publishedAt timestamp`)
  }

  return {
    id: meta.id,
    title: meta.title,
    excerpt: meta.excerpt,
    publishedAt: meta.publishedAt,
    updatedAt: meta.updatedAt,
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
  markdownExists: (id: string) => boolean,
  title = 'My Blog',
  now = new Date().toISOString(),
): BlogIndex {
  const posts = metaRecords
    .filter((meta) => meta.status === 'published')
    .filter((meta) => Boolean(meta.publishedAt))
    .filter((meta) => markdownExists(meta.id))
    .map(toIndexEntry)

  return {
    version: 1,
    title,
    updatedAt: now,
    posts: sortPostsDescendingByPublishedAt(posts),
  }
}
