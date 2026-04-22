import {
  createEmptyIndex,
  markMetaDeleted,
  publishMeta,
  rebuildIndexFromPublishedMeta,
  removeIndexEntry,
  toIndexEntry,
  unpublishMeta,
  upsertIndexEntry,
} from './blogIndex'
import { buildDatedSlugId, ensureUniqueSlugId } from './ids'
import {
  markdownExists,
  pullAllPostMeta,
  pullIndex,
  pullPostMeta,
  removePostMarkdown,
  removePostMeta,
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
  const nextIndex = upsertIndexEntry(index, toIndexEntry(nextMeta))
  await storeIndex(nextIndex)
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
  await storeIndex(nextIndex)
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
  await storeIndex(nextIndex)
}

export async function rebuildIndex(title = 'My Blog'): Promise<void> {
  const allMeta = await pullAllPostMeta()
  const publishedWithExistence = await Promise.all(
    allMeta
      .filter((meta) => meta.status === 'published' && Boolean(meta.publishedAt))
      .map(async (meta) => ({ meta, exists: await markdownExists(meta.id) })),
  )

  const validMeta = publishedWithExistence
    .filter((item) => item.exists)
    .map((item) => item.meta)

  const nextIndex = rebuildIndexFromPublishedMeta(validMeta, () => true, title)
  await storeIndex(nextIndex)
}
