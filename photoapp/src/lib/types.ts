export type SyncState = 'pending' | 'synced' | 'error'

export type GpsMetadata = {
  latitude: number
  longitude: number
  accuracyMeters?: number | null
  altitude?: number | null
  heading?: number | null
  speed?: number | null
  timestamp?: string | null
}

export type MediaItem = {
  id: string
  kind: 'photo' | 'video'

  name: string | null
  originalFilename: string
  mimeType: string

  width: number | null
  height: number | null
  durationMs: number | null

  fileSizeBytes: number

  mediaPath: string
  metadataPath: string
  thumbnailPath: string | null
  thumbnailUrl: string | null
  videoUrl: string | null

  createdAt: string
  updatedAt: string
  gps: GpsMetadata | null

  processing: {
    resized: boolean
    originalWidth?: number | null
    originalHeight?: number | null
    quality?: number | null
  }

  sync: {
    state: SyncState
    lastSyncedAt?: string | null
    error?: string | null
  }

  deletedAt?: string | null
}

export type Settings = {
  id: string
  imageQuality: number
  maxDimension: number
  gpsEnabled: boolean
  videoEnabled: boolean
  rsConnected: boolean
}
