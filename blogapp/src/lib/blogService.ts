import {
  createEmptyIndex,
  markMetaDeleted,
  publishMeta,
  rebuildIndexFromPublishedMeta,
  removeIndexEntry,
  toIndexEntry,
  toJsonFeed,
  unpublishMeta,
  upsertIndexEntry,
} from './blogIndex'
import { buildDatedSlugId, ensureUniqueSlugId } from './ids'
import {
  getPublicFeedUrl,
  getPublicPostUrl,
  markdownExists,
  pullAllPostMeta,
  pullIndex,
  pullPostMeta,
  removePostMarkdown,
  removePostMeta,
  storeFeed,
  storeIndex,
  storePostMeta,
} from './remotestorage'
import type { BlogIndex } from './types'

async function loadIndexOrCreate(): Promise<BlogIndex> {
  return (await pullIndex()) ?? createEmptyIndex()
}

export async function generatePostId(title: string, date = new Date()): Promise<string> {
  const allMeta = await pullAllPostMeta()
  const base = buildDatedSlugId(title, date)
  return ensureUniqueSlugId(base, allMeta.map((meta) => meta.id))
}

async function storeIndexAndFeed(nextIndex: BlogIndex): Promise<void> {
  await storeIndex(nextIndex)
  await storeFeed(toJsonFeed(nextIndex, getPublicFeedUrl() ?? undefined))
}

export async function publishPost(id: string): Promise<void> {
  const existingMeta = await pullPostMeta(id)
  if (!existingMeta) {
    throw new Error(`Metadata not found for post ${id}`)
  }

  const hasMarkdown = await markdownExists(id)
  if (!hasMarkdown) {
    throw new Error(`Markdown not found for post ${id}`)
  }

  const nextMeta = publishMeta(existingMeta)
  await storePostMeta(nextMeta)

  const index = await loadIndexOrCreate()
  const contentUrl = getPublicPostUrl(id)
  if (!contentUrl) {
    throw new Error('Unable to generate public content URL for this backend')
  }

  const nextIndex = upsertIndexEntry(index, toIndexEntry(nextMeta, contentUrl))
  await storeIndexAndFeed(nextIndex)
}

export async function unpublishPost(id: string): Promise<void> {
  const existingMeta = await pullPostMeta(id)
  if (!existingMeta) {
    throw new Error(`Metadata not found for post ${id}`)
  }

  const nextMeta = unpublishMeta(existingMeta)
  await storePostMeta(nextMeta)

  const index = await loadIndexOrCreate()
  const nextIndex = removeIndexEntry(index, id)
  await storeIndexAndFeed(nextIndex)
}

export async function deletePost(id: string): Promise<void> {
  const existingMeta = await pullPostMeta(id)
  if (existingMeta) {
    const deletedMeta = markMetaDeleted(existingMeta)
    await storePostMeta(deletedMeta)
  }

  await removePostMarkdown(id)
  await removePostMeta(id)

  const index = await loadIndexOrCreate()
  const nextIndex = removeIndexEntry(index, id)
  await storeIndexAndFeed(nextIndex)
}

export async function rebuildIndex(title = 'My Blog'): Promise<void> {
  const allMeta = await pullAllPostMeta()
  const publishedWithExistence = await Promise.all(
    allMeta
      .filter((meta) => meta.status === 'published' && Boolean(meta.publishedAt))
      .map(async (meta) => ({ meta, exists: await markdownExists(meta.id), contentUrl: getPublicPostUrl(meta.id) })),
  )

  const validMeta = publishedWithExistence.filter((item) => item.exists && Boolean(item.contentUrl)).map((item) => item.meta)
  const contentUrlMap = new Map(publishedWithExistence.map((item) => [item.meta.id, item.contentUrl ?? null]))

  const nextIndex = rebuildIndexFromPublishedMeta(validMeta, (id) => contentUrlMap.get(id) ?? null, title)
  await storeIndexAndFeed(nextIndex)
}
