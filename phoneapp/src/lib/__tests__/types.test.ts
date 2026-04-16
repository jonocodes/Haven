import { describe, it, expect } from 'vitest'
import type { MediaItem, Settings, GpsMetadata } from '../types'

describe('MediaItem type', () => {
  it('should accept valid photo item', () => {
    const item: MediaItem = {
      id: '123',
      kind: 'photo',
      name: 'Test Photo',
      originalFilename: 'photo.jpg',
      mimeType: 'image/jpeg',
      width: 1920,
      height: 1080,
      durationMs: null,
      fileSizeBytes: 102400,
      mediaPath: '/media/123/original.jpg',
      metadataPath: '/media/123/meta.json',
      thumbnailPath: '/media/123/thumb.jpg',
      thumbnailUrl: 'blob:http://localhost/123',
      videoUrl: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      gps: null,
      processing: {
        resized: true,
        originalWidth: 4000,
        originalHeight: 3000,
        quality: 0.8
      },
      sync: {
        state: 'synced',
        lastSyncedAt: '2024-01-01T00:00:00.000Z'
      },
      deletedAt: null
    }

    expect(item.kind).toBe('photo')
    expect(item.width).toBe(1920)
    expect(item.sync.state).toBe('synced')
  })

  it('should accept valid video item', () => {
    const item: MediaItem = {
      id: '456',
      kind: 'video',
      name: null,
      originalFilename: 'video.webm',
      mimeType: 'video/webm',
      width: 1920,
      height: 1080,
      durationMs: 30000,
      fileSizeBytes: 5120000,
      mediaPath: '/media/456/original.webm',
      metadataPath: '/media/456/meta.json',
      thumbnailPath: '/media/456/thumb.jpg',
      thumbnailUrl: 'blob:http://localhost/456-thumb',
      videoUrl: 'blob:http://localhost/456-video',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      gps: {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracyMeters: 10,
        altitude: 100,
        heading: 180,
        speed: 5,
        timestamp: '1704067200000'
      },
      processing: {
        resized: false
      },
      sync: {
        state: 'pending'
      },
      deletedAt: null
    }

    expect(item.kind).toBe('video')
    expect(item.durationMs).toBe(30000)
    expect(item.gps?.latitude).toBe(37.7749)
  })
})

describe('Settings type', () => {
  it('should accept valid settings', () => {
    const settings: Settings = {
      id: 'main',
      imageQuality: 0.8,
      maxDimension: 1920,
      gpsEnabled: true,
      videoEnabled: false,
      rsConnected: false
    }

    expect(settings.imageQuality).toBe(0.8)
    expect(settings.maxDimension).toBe(1920)
    expect(settings.gpsEnabled).toBe(true)
  })
})

describe('GpsMetadata type', () => {
  it('should accept minimal gps data', () => {
    const gps: GpsMetadata = {
      latitude: 37.7749,
      longitude: -122.4194
    }

    expect(gps.latitude).toBe(37.7749)
    expect(gps.longitude).toBe(-122.4194)
  })

  it('should accept full gps data', () => {
    const gps: GpsMetadata = {
      latitude: 37.7749,
      longitude: -122.4194,
      accuracyMeters: 5,
      altitude: 50,
      heading: 90,
      speed: 10,
      timestamp: '1704067200000'
    }

    expect(gps.accuracyMeters).toBe(5)
    expect(gps.altitude).toBe(50)
    expect(gps.heading).toBe(90)
    expect(gps.speed).toBe(10)
  })
})
