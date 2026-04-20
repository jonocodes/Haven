import Dexie, { type Table } from 'dexie'
import type { MediaItem, Settings } from './types'

const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  imageQuality: 0.8,
  maxDimension: 1920,
  gpsEnabled: true,
  videoEnabled: false,
  rsConnected: false
}

export class HavenDB extends Dexie {
  mediaItems!: Table<MediaItem, string>
  settings!: Table<Settings, string>
  mediaBlobs!: Table<{ id: string; blob: Blob }, string>
  thumbnailBlobs!: Table<{ id: string; blob: Blob }, string>

  constructor() {
    super('HavenDB')
    this.version(3).stores({
      mediaItems: 'id, kind, createdAt, updatedAt, deletedAt, sync.state, name',
      settings: 'id',
      mediaBlobs: 'id'
    })
    this.version(4).stores({
      mediaItems: 'id, kind, createdAt, updatedAt, deletedAt, sync.state, name',
      settings: 'id',
      mediaBlobs: 'id',
      thumbnailBlobs: 'id'
    }).upgrade(tx => {
      return tx.table('thumbnailBlobs').toArray().then(thumbs => {
        return tx.table('mediaBlobs').bulkPut(thumbs)
      })
    })
  }
}

export const db = new HavenDB()

let cachedSettings: Settings = DEFAULT_SETTINGS
let settingsInitialized = false

export async function initializeSettings(): Promise<void> {
  if (settingsInitialized) return
  const existing = await db.settings.get('main')
  if (existing) {
    cachedSettings = existing
  } else {
    await db.settings.put(DEFAULT_SETTINGS)
    cachedSettings = DEFAULT_SETTINGS
  }
  settingsInitialized = true
}

export function getSettings(): Settings {
  return cachedSettings
}

export async function getSettingsAsync(): Promise<Settings> {
  if (!settingsInitialized) {
    await initializeSettings()
  }
  return cachedSettings
}

export async function updateSettings(updates: Partial<Settings>): Promise<void> {
  await db.settings.update('main', updates)
  cachedSettings = { ...cachedSettings, ...updates }
}

export async function getMediaItems(options?: { includeDeleted?: boolean }): Promise<MediaItem[]> {
  let items = await db.mediaItems.toArray()
  if (!options?.includeDeleted) {
    items = items.filter(item => !item.deletedAt)
  }
  return items.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
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

export async function storeMediaBlob(id: string, blob: Blob): Promise<void> {
  await db.mediaBlobs.put({ id, blob })
}

export async function getMediaBlob(id: string): Promise<Blob | undefined> {
  const record = await db.mediaBlobs.get(id)
  return record?.blob
}

export function createBlobUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

export async function hydrateMediaUrls(item: MediaItem): Promise<MediaItem> {
  if (item.thumbnailUrl) {
    try {
      URL.revokeObjectURL(item.thumbnailUrl)
    } catch {
      // Blob URL already invalid, ignore
    }
    item.thumbnailUrl = null
  }
  if (item.videoUrl) {
    try {
      URL.revokeObjectURL(item.videoUrl)
    } catch {
      // Blob URL already invalid, ignore
    }
    item.videoUrl = null
  }
  
  if (item.kind === 'video') {
    const videoBlob = await getMediaBlob(item.id)
    if (videoBlob) {
      item.videoUrl = createBlobUrl(videoBlob)
    }
    const thumbBlob = await getMediaBlob(`${item.id}_thumb`)
    if (thumbBlob) {
      item.thumbnailUrl = createBlobUrl(thumbBlob)
    }
  } else {
    const blob = await getMediaBlob(item.id)
    if (blob) {
      item.thumbnailUrl = createBlobUrl(blob)
    }
  }
  
  return item
}

export async function getStorageUsage(): Promise<{
  photoCount: number
  videoCount: number
  totalBytes: number
  thumbnailBytes: number
}> {
  const items = await db.mediaItems.toArray()
  const thumbs = await db.thumbnailBlobs.toArray()
  
  let photoCount = 0
  let videoCount = 0
  let totalBytes = 0
  let thumbnailBytes = 0
  
  for (const item of items) {
    if (!item.deletedAt) {
      if (item.kind === 'video') {
        videoCount++
      } else {
        photoCount++
      }
      totalBytes += item.fileSizeBytes
    }
  }
  
  for (const thumb of thumbs) {
    if (thumb.blob) {
      thumbnailBytes += thumb.blob.size
    }
  }
  
  return {
    photoCount,
    videoCount,
    totalBytes,
    thumbnailBytes
  }
}
