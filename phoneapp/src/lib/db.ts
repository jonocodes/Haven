import Dexie, { type Table } from 'dexie'
import type { MediaItem, Settings } from './types'

export class HavenDB extends Dexie {
  mediaItems!: Table<MediaItem, string>
  settings!: Table<Settings, string>
  thumbnailBlobs!: Table<{ id: string; blob: Blob }, string>

  constructor() {
    super('HavenDB')
    this.version(2).stores({
      mediaItems: 'id, kind, createdAt, updatedAt, deletedAt, sync.state, name',
      settings: 'id',
      thumbnailBlobs: 'id'
    })
  }
}

export const db = new HavenDB()

export async function getSettings(): Promise<Settings> {
  let settings = await db.settings.get('main')
  if (!settings) {
    settings = {
      id: 'main',
      imageQuality: 0.8,
      maxDimension: 1920,
      gpsEnabled: true,
      rsConnected: false
    }
    await db.settings.put(settings)
  }
  return settings
}

export async function updateSettings(updates: Partial<Settings>): Promise<void> {
  await db.settings.update('main', updates)
}

export async function getMediaItems(options?: { includeDeleted?: boolean }): Promise<MediaItem[]> {
  const query = options?.includeDeleted 
    ? db.mediaItems.toCollection()
    : db.mediaItems.where('deletedAt').equals('').or('deletedAt').equals(null as unknown as string)
  
  return query.sortBy('createdAt').then(items => items.reverse())
}

export async function getMediaItem(id: string): Promise<MediaItem | undefined> {
  return db.mediaItems.get(id)
}

export async function createMediaItem(item: MediaItem): Promise<string> {
  return db.mediaItems.add(item)
}

export async function updateMediaItem(id: string, updates: Partial<MediaItem>): Promise<void> {
  await db.mediaItems.update(id, updates)
}

export async function softDeleteMediaItem(id: string): Promise<void> {
  await db.mediaItems.update(id, { deletedAt: new Date().toISOString() })
}

export async function storeThumbnailBlob(id: string, blob: Blob): Promise<void> {
  await db.thumbnailBlobs.put({ id, blob })
}

export async function getThumbnailBlob(id: string): Promise<Blob | undefined> {
  const record = await db.thumbnailBlobs.get(id)
  return record?.blob
}

export function createThumbnailUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

export async function hydrateThumbnailUrl(item: MediaItem): Promise<MediaItem> {
  if (item.thumbnailUrl) {
    try {
      URL.revokeObjectURL(item.thumbnailUrl)
    } catch {
      // Blob URL already invalid, ignore
    }
  }
  const blob = await getThumbnailBlob(item.id)
  if (blob) {
    item.thumbnailUrl = createThumbnailUrl(blob)
  }
  return item
}
