import { describe, it, expect, beforeEach, vi } from 'vitest'

// vi.hoisted ensures these exist when vi.mock factory runs (which is hoisted before imports)
const { mockStoreFile, mockGetFile, mockGetListing, mockRemove, mockOn, mockScopeOn, mockClient } =
  vi.hoisted(() => {
    const mockStoreFile = vi.fn().mockResolvedValue(undefined)
    const mockGetFile = vi.fn()
    const mockGetListing = vi.fn()
    const mockRemove = vi.fn().mockResolvedValue(undefined)
    const mockOn = vi.fn()
    const mockScopeOn = vi.fn()
    const mockClient = {
      storeFile: mockStoreFile,
      getFile: mockGetFile,
      getListing: mockGetListing,
      remove: mockRemove,
      on: mockScopeOn,
    }
    return { mockStoreFile, mockGetFile, mockGetListing, mockRemove, mockOn, mockScopeOn, mockClient }
  })

vi.mock('remotestoragejs', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        access: { claim: vi.fn() },
        caching: { enable: vi.fn() },
        setSyncInterval: vi.fn(),
        scope: vi.fn().mockReturnValue(mockClient),
        connected: false,
        on: mockOn,
      }
    }),
  }
})

import {
  pushNote,
  pullNote,
  listRemoteNoteIds,
  pullAllNotes,
  pushTombstone,
  listRemoteTombstoneIds,
  isConnected,
  onConnected,
  onDisconnected,
  onRemoteChange,
  rs,
} from '../lib/remotestorage'
import type { Note } from '../lib/notes'

const sampleNote: Note = {
  id: 'note-abc',
  title: 'Hello',
  body: 'World',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetFile.mockResolvedValue(undefined)
  mockGetListing.mockResolvedValue(null)
})

// ─── pushNote ────────────────────────────────────────────────────────────────

describe('pushNote', () => {
  it('calls storeFile with correct MIME type and path', async () => {
    await pushNote(sampleNote)
    expect(mockStoreFile).toHaveBeenCalledWith(
      'application/json',
      `common/notes/${sampleNote.id}.json`,
      expect.any(String),
    )
  })

  it('serialises the note as JSON', async () => {
    await pushNote(sampleNote)
    const body = mockStoreFile.mock.calls[0]?.[2]
    expect(JSON.parse(body)).toMatchObject({ id: sampleNote.id, title: 'Hello' })
  })

  it('rejects when storeFile rejects', async () => {
    mockStoreFile.mockRejectedValueOnce(new Error('write fail'))
    await expect(pushNote(sampleNote)).rejects.toThrow('write fail')
  })
})

// ─── pullNote ────────────────────────────────────────────────────────────────

describe('pullNote', () => {
  it('returns parsed Note when getFile returns data', async () => {
    mockGetFile.mockResolvedValue({ data: JSON.stringify(sampleNote) })
    const result = await pullNote(sampleNote.id)
    expect(result).toMatchObject({ id: sampleNote.id, title: 'Hello' })
  })

  it('returns null when getFile returns null', async () => {
    mockGetFile.mockResolvedValue(null)
    expect(await pullNote('missing')).toBeNull()
  })

  it('returns null when getFile returns object with no data', async () => {
    mockGetFile.mockResolvedValue({ data: null })
    expect(await pullNote('missing')).toBeNull()
  })
})

// ─── listRemoteNoteIds ───────────────────────────────────────────────────────

describe('listRemoteNoteIds', () => {
  it('returns ids parsed from .json listing keys', async () => {
    mockGetListing.mockResolvedValue({ 'abc.json': {}, 'def.json': {} })
    const ids = await listRemoteNoteIds()
    expect(ids).toEqual(expect.arrayContaining(['abc', 'def']))
  })

  it('excludes directory entries not ending in .json', async () => {
    mockGetListing.mockResolvedValue({ 'subfolder/': {}, 'note.json': {} })
    const ids = await listRemoteNoteIds()
    expect(ids).toEqual(['note'])
  })

  it('returns empty array when getListing returns null', async () => {
    mockGetListing.mockResolvedValue(null)
    expect(await listRemoteNoteIds()).toEqual([])
  })
})

// ─── pullAllNotes ────────────────────────────────────────────────────────────

describe('pullAllNotes', () => {
  it('returns all notes for all listed ids', async () => {
    mockGetListing.mockResolvedValue({ 'note-abc.json': {} })
    mockGetFile.mockResolvedValue({ data: JSON.stringify(sampleNote) })
    const notes = await pullAllNotes()
    expect(notes).toHaveLength(1)
    expect(notes[0]?.id).toBe(sampleNote.id)
  })

  it('filters out null results', async () => {
    mockGetListing.mockResolvedValue({ 'note-abc.json': {}, 'note-missing.json': {} })
    mockGetFile
      .mockResolvedValueOnce({ data: JSON.stringify(sampleNote) })
      .mockResolvedValueOnce(null)
    const notes = await pullAllNotes()
    expect(notes).toHaveLength(1)
  })
})

// ─── pushTombstone ───────────────────────────────────────────────────────────

describe('pushTombstone', () => {
  it('writes tombstone file to correct path', async () => {
    await pushTombstone('note-xyz')
    expect(mockStoreFile).toHaveBeenCalledWith(
      'application/json',
      'common/tombstones/note-xyz.json',
      expect.stringContaining('deletedAt'),
    )
  })

  it('removes the original note file', async () => {
    await pushTombstone('note-xyz')
    expect(mockRemove).toHaveBeenCalledWith('common/notes/note-xyz.json')
  })

  it('calls both storeFile and remove', async () => {
    await pushTombstone('note-xyz')
    expect(mockStoreFile).toHaveBeenCalledOnce()
    expect(mockRemove).toHaveBeenCalledOnce()
  })
})

// ─── listRemoteTombstoneIds ──────────────────────────────────────────────────

describe('listRemoteTombstoneIds', () => {
  it('returns ids from tombstone listing', async () => {
    mockGetListing.mockResolvedValue({ 'note-1.json': {}, 'note-2.json': {} })
    const ids = await listRemoteTombstoneIds()
    expect(ids).toEqual(expect.arrayContaining(['note-1', 'note-2']))
  })

  it('returns empty array when no tombstones', async () => {
    mockGetListing.mockResolvedValue(null)
    expect(await listRemoteTombstoneIds()).toEqual([])
  })
})

// ─── isConnected ─────────────────────────────────────────────────────────────

describe('isConnected', () => {
  it('returns true when rs.connected is true', () => {
    Object.defineProperty(rs, 'connected', { value: true, writable: true, configurable: true })
    expect(isConnected()).toBe(true)
  })

  it('returns false when rs.connected is false', () => {
    Object.defineProperty(rs, 'connected', { value: false, writable: true, configurable: true })
    expect(isConnected()).toBe(false)
  })
})

// ─── event registration ──────────────────────────────────────────────────────

describe('event registration', () => {
  it('onConnected registers callback on "connected" event', () => {
    const cb = vi.fn()
    onConnected(cb)
    expect(mockOn).toHaveBeenCalledWith('connected', cb)
  })

  it('onDisconnected registers callback on "disconnected" event', () => {
    const cb = vi.fn()
    onDisconnected(cb)
    expect(mockOn).toHaveBeenCalledWith('disconnected', cb)
  })

  it('onRemoteChange fires only for remote origin events', () => {
    const cb = vi.fn()
    onRemoteChange(cb)

    const handler = mockScopeOn.mock.calls.find((c) => c[0] === 'change')?.[1]
    expect(handler).toBeDefined()

    handler({ origin: 'remote' })
    expect(cb).toHaveBeenCalledOnce()
  })

  it('onRemoteChange does not fire for local origin events', () => {
    const cb = vi.fn()
    onRemoteChange(cb)
    const handler = mockScopeOn.mock.calls.find((c) => c[0] === 'change')?.[1]
    handler({ origin: 'local' })
    expect(cb).not.toHaveBeenCalled()
  })
})
