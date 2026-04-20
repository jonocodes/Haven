import RemoteStorage from 'remotestoragejs'
import type { MediaItem } from './types'

let rs: RemoteStorage | null = null

export function initRemoteStorage(): RemoteStorage {
  if (rs) return rs

  rs = new RemoteStorage({ cache: true })
  
  rs.access.claim('media', 'rw')
  rs.caching.enable('/media/')

  return rs
}

export function getRemoteStorage(): RemoteStorage {
  if (!rs) {
    return initRemoteStorage()
  }
  return rs
}

export function getMediaClient() {
  const storage = getRemoteStorage()
  return storage.scope('/media/')
}

export async function storeMediaFile(
  id: string, 
  blob: Blob, 
  filename: string,
  mimeType?: string
): Promise<string> {
  const client = getMediaClient()
  const path = `items/${id}/${filename}`
  const arrayBuffer = await blob.arrayBuffer()
  
  return client.storeFile(mimeType || blob.type || 'application/octet-stream', path, arrayBuffer)
}

export async function storeMetadata(id: string, metadata: MediaItem): Promise<string> {
  const client = getMediaClient()
  const path = `items/${id}/meta.json`
  
  return client.storeObject('media-item', path, metadata)
}

export async function getMetadata(id: string): Promise<MediaItem | null> {
  const client = getMediaClient()
  const path = `items/${id}/meta.json`
  
  try {
    const data = await client.getObject(path)
    return data as MediaItem
  } catch {
    return null
  }
}

export async function getMediaFile(id: string, filename: string): Promise<Blob | null> {
  const client = getMediaClient()
  const path = `items/${id}/${filename}`
  
  try {
    const blob = await client.getFile(path)
    return blob as Blob
  } catch {
    return null
  }
}

export async function listRemoteItems(): Promise<string[]> {
  const client = getMediaClient()
  
  try {
    const listing = await client.getListing('items/') as Record<string, boolean>
    return Object.keys(listing).map(key => key.split('/')[1]).filter(Boolean)
  } catch {
    return []
  }
}

export function onRemoteChange(callback: (event: { relativePath: string; origin: string }) => void): void {
  const storage = getRemoteStorage()
  storage.on('change', callback as (event: unknown) => void)
}
