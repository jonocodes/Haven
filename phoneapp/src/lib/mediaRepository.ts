import { v4 as uuidv4 } from 'uuid'
import type { MediaItem } from './types'
import { 
  createMediaItem, 
  getMediaItem, 
  getMediaItems, 
  updateMediaItem, 
  softDeleteMediaItem as dbSoftDelete,
  getSettingsAsync,
  storeMediaBlob,
  hydrateMediaUrls
} from './db'
import { storeMediaFile, storeMetadata, getMetadata, listRemoteItems } from './remoteStorage'
import { resizeImageBlob, generateThumbnail, getImageDimensions } from './imageProcessing'
import { getCurrentLocation } from './location'

export async function captureAndSaveMedia(
  videoElement: HTMLVideoElement,
  canvas: HTMLCanvasElement
): Promise<MediaItem> {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }
  
  canvas.width = videoElement.videoWidth
  canvas.height = videoElement.videoHeight
  ctx.drawImage(videoElement, 0, 0)
  
  const originalBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to capture'))
      },
      'image/jpeg',
      1.0
    )
  })
  
  const settings = await getSettingsAsync()
  const dimensions = await getImageDimensions(originalBlob)
  
  const resizedBlob = await resizeImageBlob(originalBlob, {
    maxDimension: settings.maxDimension,
    quality: settings.imageQuality
  })
  
  const thumbnailBlob = await generateThumbnail(resizedBlob)
  
  const gps = settings.gpsEnabled ? await getCurrentLocation() : null
  
  const id = uuidv4()
  const now = new Date().toISOString()
  
  const mediaItem: MediaItem = {
    id,
    kind: 'photo',
    name: null,
    originalFilename: `photo_${Date.now()}.jpg`,
    mimeType: 'image/jpeg',
    width: dimensions.width,
    height: dimensions.height,
    durationMs: null,
    fileSizeBytes: resizedBlob.size,
    mediaPath: '',
    metadataPath: '',
    thumbnailPath: null,
    thumbnailUrl: null,
    videoUrl: null,
    createdAt: now,
    updatedAt: now,
    gps,
    processing: {
      resized: true,
      originalWidth: dimensions.width,
      originalHeight: dimensions.height,
      quality: settings.imageQuality
    },
    sync: {
      state: 'pending'
    },
    deletedAt: null
  }
  
  const thumbnailUrl = URL.createObjectURL(thumbnailBlob)
  mediaItem.thumbnailUrl = thumbnailUrl
  
  await storeMediaBlob(id, thumbnailBlob)
  await createMediaItem(mediaItem)
  
  const resizedDimensions = await getImageDimensions(resizedBlob)
  mediaItem.width = resizedDimensions.width
  mediaItem.height = resizedDimensions.height
  mediaItem.fileSizeBytes = resizedBlob.size
  
  try {
    const mediaPath = await storeMediaFile(id, resizedBlob, 'original.jpg')
    const thumbPath = await storeMediaFile(id, thumbnailBlob, 'thumb.jpg')
    const metaPath = await storeMetadata(id, mediaItem)
    
    mediaItem.mediaPath = mediaPath
    mediaItem.thumbnailPath = thumbPath
    mediaItem.metadataPath = metaPath
    mediaItem.sync.state = 'synced'
    mediaItem.sync.lastSyncedAt = now
    
    await updateMediaItem(id, {
      mediaPath,
      thumbnailPath: thumbPath,
      metadataPath: metaPath,
      sync: mediaItem.sync
    })
  } catch (error) {
    mediaItem.sync.state = 'error'
    mediaItem.sync.error = error instanceof Error ? error.message : 'Unknown error'
    await updateMediaItem(id, { sync: mediaItem.sync })
  }
  
  return mediaItem
}

export async function listMedia(includeDeleted = false): Promise<MediaItem[]> {
  const items = await getMediaItems({ includeDeleted })
  return Promise.all(items.map(hydrateMediaUrls))
}

export async function importPhoto(file: File): Promise<MediaItem> {
  const id = uuidv4()
  const now = new Date().toISOString()
  const settings = await getSettingsAsync()
  
  const originalBlob = file
  
  const dimensions = await getImageDimensions(originalBlob)
  
  let resizedBlob: Blob = originalBlob
  if (dimensions.width > settings.maxDimension || dimensions.height > settings.maxDimension) {
    resizedBlob = await resizeImageBlob(originalBlob, {
      maxDimension: settings.maxDimension,
      quality: settings.imageQuality
    })
  }
  
  const thumbnailBlob = await generateThumbnail(resizedBlob)
  
  const mediaItem: MediaItem = {
    id,
    kind: 'photo',
    name: file.name.replace(/\.[^/.]+$/, ''),
    originalFilename: file.name,
    mimeType: file.type || 'image/jpeg',
    width: dimensions.width,
    height: dimensions.height,
    durationMs: null,
    fileSizeBytes: resizedBlob.size,
    mediaPath: '',
    metadataPath: '',
    thumbnailPath: null,
    thumbnailUrl: null,
    videoUrl: null,
    createdAt: now,
    updatedAt: now,
    gps: null,
    processing: {
      resized: resizedBlob !== originalBlob,
      originalWidth: dimensions.width,
      originalHeight: dimensions.height,
      quality: settings.imageQuality
    },
    sync: {
      state: 'pending'
    },
    deletedAt: null
  }
  
  const thumbnailUrl = URL.createObjectURL(thumbnailBlob)
  mediaItem.thumbnailUrl = thumbnailUrl
  
  await storeMediaBlob(id, thumbnailBlob)
  
  const finalDimensions = await getImageDimensions(resizedBlob)
  mediaItem.width = finalDimensions.width
  mediaItem.height = finalDimensions.height
  mediaItem.fileSizeBytes = resizedBlob.size
  
  await createMediaItem(mediaItem)
  
  try {
    const ext = file.name.split('.').pop() || 'jpg'
    const mediaPath = await storeMediaFile(id, resizedBlob, `original.${ext}`)
    const thumbPath = await storeMediaFile(id, thumbnailBlob, 'thumb.jpg')
    const metaPath = await storeMetadata(id, mediaItem)
    
    mediaItem.mediaPath = mediaPath
    mediaItem.thumbnailPath = thumbPath
    mediaItem.metadataPath = metaPath
    mediaItem.sync.state = 'synced'
    mediaItem.sync.lastSyncedAt = now
    
    await updateMediaItem(id, {
      mediaPath,
      thumbnailPath: thumbPath,
      metadataPath: metaPath,
      sync: mediaItem.sync
    })
  } catch (error) {
    mediaItem.sync.state = 'error'
    mediaItem.sync.error = error instanceof Error ? error.message : 'Unknown error'
    await updateMediaItem(id, { sync: mediaItem.sync })
  }
  
  return mediaItem
}

export async function getMedia(id: string): Promise<MediaItem | undefined> {
  const item = await getMediaItem(id)
  if (item) {
    return hydrateMediaUrls(item)
  }
  return undefined
}

export async function renameMedia(id: string, name: string): Promise<void> {
  const item = await getMediaItem(id)
  if (!item) throw new Error('Media not found')
  
  const now = new Date().toISOString()
  await updateMediaItem(id, {
    name,
    updatedAt: now,
    sync: { ...item.sync, state: 'pending' }
  })
  
  try {
    const updated = await getMediaItem(id)
    if (updated) {
      await storeMetadata(id, updated)
      await updateMediaItem(id, {
        sync: { ...updated.sync, state: 'synced', lastSyncedAt: now }
      })
    }
  } catch (error) {
    await updateMediaItem(id, {
      sync: { ...item.sync, state: 'error', error: error instanceof Error ? error.message : 'Unknown error' }
    })
  }
}

export async function softDeleteMedia(id: string): Promise<void> {
  const item = await getMediaItem(id)
  if (!item) throw new Error('Media not found')
  
  const now = new Date().toISOString()
  
  await dbSoftDelete(id)
  
  try {
    const deletedItem: MediaItem = {
      ...item,
      deletedAt: now,
      updatedAt: now,
      sync: { ...item.sync, state: 'pending' }
    }
    await storeMetadata(id, deletedItem)
    await updateMediaItem(id, {
      sync: { ...deletedItem.sync, state: 'synced', lastSyncedAt: now }
    })
  } catch (error) {
    await updateMediaItem(id, {
      sync: { ...item.sync, state: 'error', error: error instanceof Error ? error.message : 'Unknown error' }
    })
  }
}

export async function syncMediaItem(id: string): Promise<void> {
  const item = await getMediaItem(id)
  if (!item) return
  
  try {
    await getMetadata(id)
    await storeMetadata(id, item)
    await updateMediaItem(id, {
      sync: { ...item.sync, state: 'synced', lastSyncedAt: new Date().toISOString() }
    })
  } catch (error) {
    await updateMediaItem(id, {
      sync: { ...item.sync, state: 'error', error: error instanceof Error ? error.message : 'Unknown error' }
    })
  }
}

export async function reconcileRemoteChanges(): Promise<void> {
  const remoteIds = await listRemoteItems()
  const localItems = await getMediaItems()
  
  for (const id of remoteIds) {
    if (!localItems.find(item => item.id === id)) {
      const remoteMeta = await getMetadata(id)
      if (remoteMeta && !remoteMeta.deletedAt) {
        await createMediaItem(remoteMeta)
      }
    }
  }
}

export async function recordAndSaveVideo(
  blob: Blob,
  gps: { latitude: number; longitude: number; accuracyMeters?: number | null; altitude?: number | null; heading?: number | null; speed?: number | null; timestamp?: string | null } | null
): Promise<MediaItem> {
  const id = uuidv4()
  const now = new Date().toISOString()
  
  const mediaItem: MediaItem = {
    id,
    kind: 'video',
    name: null,
    originalFilename: `video_${Date.now()}.webm`,
    mimeType: 'video/webm',
    width: null,
    height: null,
    durationMs: null,
    fileSizeBytes: blob.size,
    mediaPath: '',
    metadataPath: '',
    thumbnailPath: null,
    thumbnailUrl: null,
    videoUrl: null,
    createdAt: now,
    updatedAt: now,
    gps,
    processing: {
      resized: false
    },
    sync: {
      state: 'pending'
    },
    deletedAt: null
  }
  
  const videoUrl = URL.createObjectURL(blob)
  mediaItem.videoUrl = videoUrl
  await storeMediaBlob(id, blob)
  
  const thumbnailBlob = await generateVideoThumbnail(blob)
  if (thumbnailBlob) {
    const thumbnailUrl = URL.createObjectURL(thumbnailBlob)
    mediaItem.thumbnailUrl = thumbnailUrl
    await storeMediaBlob(`${id}_thumb`, thumbnailBlob)
  }
  
  await createMediaItem(mediaItem)
  
  try {
    const mediaPath = await storeMediaFile(id, blob, 'original.webm')
    const metaPath = await storeMetadata(id, mediaItem)
    
    mediaItem.mediaPath = mediaPath
    mediaItem.metadataPath = metaPath
    mediaItem.sync.state = 'synced'
    mediaItem.sync.lastSyncedAt = now
    
    await updateMediaItem(id, {
      mediaPath,
      metadataPath: metaPath,
      sync: mediaItem.sync
    })
  } catch (error) {
    mediaItem.sync.state = 'error'
    mediaItem.sync.error = error instanceof Error ? error.message : 'Unknown error'
    await updateMediaItem(id, { sync: mediaItem.sync })
  }
  
  return mediaItem
}

async function generateVideoThumbnail(blob: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(blob)
    video.onloadeddata = () => {
      video.currentTime = 0.1
    }
    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((thumbBlob) => {
          URL.revokeObjectURL(url)
          resolve(thumbBlob)
        }, 'image/jpeg', 0.7)
      } else {
        URL.revokeObjectURL(url)
        resolve(null)
      }
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    video.src = url
  })
}
