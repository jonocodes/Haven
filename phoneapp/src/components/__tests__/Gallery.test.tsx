import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useLiveQuery } from 'dexie-react-hooks'
import type { MediaItem } from '@/lib/types'
import { Gallery } from '../Gallery'

vi.mock('dexie-react-hooks')

describe('Gallery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useLiveQuery).mockImplementation((queryFn: () => unknown) => {
      return queryFn()
    })
  })

  it('should render loading state initially', () => {
    vi.mocked(useLiveQuery).mockReturnValue(undefined as ReturnType<typeof useLiveQuery>)
    render(<Gallery />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should render empty state when no photos', async () => {
    vi.mocked(useLiveQuery).mockReturnValue([] as ReturnType<typeof useLiveQuery>)
    render(<Gallery />)
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })
    expect(screen.getByText('No photos yet.')).toBeInTheDocument()
  })

  it('should render gallery with photos', async () => {
    const mockPhotos: MediaItem[] = [{
      id: '1',
      kind: 'photo',
      name: 'Test Photo',
      originalFilename: 'test.jpg',
      mimeType: 'image/jpeg',
      width: 1920,
      height: 1080,
      durationMs: null,
      fileSizeBytes: 102400,
      mediaPath: '',
      metadataPath: '',
      thumbnailPath: null,
      thumbnailUrl: 'blob:http://localhost/1',
      videoUrl: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      gps: null,
      processing: { resized: true },
      sync: { state: 'synced' },
      deletedAt: null
    }]
    vi.mocked(useLiveQuery).mockReturnValue(mockPhotos as ReturnType<typeof useLiveQuery>)
    render(<Gallery />)
    await waitFor(() => {
      expect(screen.getByText('Test Photo')).toBeInTheDocument()
    })
  })

  it('should render upload button', async () => {
    vi.mocked(useLiveQuery).mockReturnValue([] as ReturnType<typeof useLiveQuery>)
    render(<Gallery />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /📤 Upload/i })).toBeInTheDocument()
    })
  })

  it('should show photo dimensions and size', async () => {
    const mockPhotos: MediaItem[] = [{
      id: '1',
      kind: 'photo',
      name: null,
      originalFilename: 'landscape.jpg',
      mimeType: 'image/jpeg',
      width: 1920,
      height: 1080,
      durationMs: null,
      fileSizeBytes: 1536000,
      mediaPath: '',
      metadataPath: '',
      thumbnailPath: null,
      thumbnailUrl: 'blob:http://localhost/1',
      videoUrl: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      gps: null,
      processing: { resized: true },
      sync: { state: 'synced' },
      deletedAt: null
    }]
    vi.mocked(useLiveQuery).mockReturnValue(mockPhotos as ReturnType<typeof useLiveQuery>)
    render(<Gallery />)
    await waitFor(() => {
      expect(screen.getByText(/1920×1080/)).toBeInTheDocument()
      expect(screen.getByText(/1\.46 MB/)).toBeInTheDocument()
    })
  })
})
