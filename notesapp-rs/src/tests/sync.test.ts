import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Note, SyncMetadata } from '../lib/notes'

type NoteWithMeta = Note & { meta: SyncMetadata }

let notes: Map<string, Note>
let syncMetaById: Map<string, SyncMetadata>
let settings: Map<string, string>
let pendingDeletes: Set<string>

function nowIso(): string {
  return new Date().toISOString()
}

function getDirtyNotesMock(): Array<NoteWithMeta> {
  return [...syncMetaById.values()]
    .filter((meta) => meta.isDirty)
    .map((meta) => {
      const note = notes.get(meta.noteId)
      return note ? { ...note, meta } : null
    })
    .filter((note): note is NoteWithMeta => note !== null)
}

vi.mock('../lib/db', () => ({
  applyRemoteNote: async (note: Note) => {
    const existing = notes.get(note.id)
    const merged = !existing || note.updatedAt >= existing.updatedAt
      ? note
      : {
          ...existing,
          body: note.body,
        }
    notes.set(note.id, merged)
    syncMetaById.set(note.id, {
      noteId: note.id,
      isDirty: false,
      lastConfirmedSyncAt: nowIso(),
    })
  },
  applyRemoteTombstone: async (noteId: string) => {
    notes.delete(noteId)
    syncMetaById.delete(noteId)
    pendingDeletes.delete(noteId)
  },
  clearPendingDelete: async (noteId: string) => {
    pendingDeletes.delete(noteId)
  },
  getDirtyNotes: async () => getDirtyNotesMock(),
  getNote: async (id: string) => notes.get(id),
  getRemoteNotePayload: async (id: string) => notes.get(id),
  getPendingDeletes: async () => [...pendingDeletes],
  markSynced: async (noteId: string) => {
    const current = syncMetaById.get(noteId)
    if (!current) return
    syncMetaById.set(noteId, {
      ...current,
      isDirty: false,
      lastConfirmedSyncAt: nowIso(),
      syncError: undefined,
    })
  },
  markSyncAttempted: async (noteId: string) => {
    const current = syncMetaById.get(noteId)
    if (!current) return
    syncMetaById.set(noteId, {
      ...current,
      lastAttemptedSyncAt: nowIso(),
    })
  },
  markSyncError: async (noteId: string, error: string) => {
    const current = syncMetaById.get(noteId)
    if (!current) return
    syncMetaById.set(noteId, {
      ...current,
      syncError: error,
      lastAttemptedSyncAt: nowIso(),
    })
  },
  setSetting: async (key: string, value: string) => {
    settings.set(key, value)
  },
}))

vi.mock('../lib/remotestorage', () => ({
  isConnected: vi.fn(),
  pushNote: vi.fn(),
  pullAllNotes: vi.fn(),
  pushTombstone: vi.fn(),
  listRemoteTombstoneIds: vi.fn(),
}))

import * as rs from '../lib/remotestorage'
import { pullAndMerge, pushDirtyNotes, schedulePush } from '../lib/sync'

beforeEach(() => {
  notes = new Map()
  syncMetaById = new Map()
  settings = new Map()
  pendingDeletes = new Set()
  vi.mocked(rs.isConnected).mockReturnValue(true)
  vi.mocked(rs.pushNote).mockResolvedValue(undefined)
  vi.mocked(rs.pullAllNotes).mockResolvedValue([])
  vi.mocked(rs.pushTombstone).mockResolvedValue(undefined)
  vi.mocked(rs.listRemoteTombstoneIds).mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllTimers()
  vi.clearAllMocks()
  vi.useRealTimers()
})

async function seedNote(overrides: Partial<Note> = {}, metaOverrides: Partial<SyncMetadata> = {}): Promise<Note> {
  const note: Note = {
    id: crypto.randomUUID(),
    title: 'Note',
    body: 'Body',
    updatedAt: nowIso(),
    ...overrides,
  }
  notes.set(note.id, note)
  syncMetaById.set(note.id, {
    noteId: note.id,
    isDirty: true,
    ...metaOverrides,
  })
  return note
}

describe('pushDirtyNotes', () => {
  it('does nothing when offline', async () => {
    vi.mocked(rs.isConnected).mockReturnValue(false)
    await seedNote()
    await pushDirtyNotes()
    expect(rs.pushNote).not.toHaveBeenCalled()
  })

  it('pushes each dirty note', async () => {
    const a = await seedNote()
    const b = await seedNote()
    await pushDirtyNotes()
    expect(rs.pushNote).toHaveBeenCalledTimes(2)
    const pushedIds = vi.mocked(rs.pushNote).mock.calls.map((call) => call[0].id)
    expect(pushedIds).toContain(a.id)
    expect(pushedIds).toContain(b.id)
  })

  it('does not push clean notes', async () => {
    await seedNote({}, { isDirty: false })
    await pushDirtyNotes()
    expect(rs.pushNote).not.toHaveBeenCalled()
  })

  it('sets lastPushAt setting when notes are pushed', async () => {
    await seedNote()
    await pushDirtyNotes()
    expect(settings.get('lastPushAt')).toBeDefined()
  })

  it('does not set lastPushAt when no dirty notes', async () => {
    await pushDirtyNotes()
    expect(settings.get('lastPushAt')).toBeUndefined()
  })

  it('records syncError when pushNote throws', async () => {
    const note = await seedNote()
    vi.mocked(rs.pushNote).mockRejectedValueOnce(new Error('network fail'))
    await pushDirtyNotes()
    expect(syncMetaById.get(note.id)?.syncError).toContain('network fail')
  })

  it('continues pushing other notes after one failure', async () => {
    const a = await seedNote()
    const b = await seedNote()
    vi.mocked(rs.pushNote).mockImplementation(async (note: Note) => {
      if (note.id === a.id) throw new Error('fail')
    })
    await pushDirtyNotes()
    expect(rs.pushNote).toHaveBeenCalledTimes(2)
    expect(syncMetaById.get(b.id)?.isDirty).toBe(false)
  })

  it('pushes tombstones for pending deletes', async () => {
    pendingDeletes.add('dead-id')
    await pushDirtyNotes()
    expect(rs.pushTombstone).toHaveBeenCalledWith('dead-id')
  })

  it('clears pending delete after successful tombstone push', async () => {
    pendingDeletes.add('dead-id')
    await pushDirtyNotes()
    expect(pendingDeletes.has('dead-id')).toBe(false)
  })

  it('does not clear pending delete when pushTombstone throws', async () => {
    pendingDeletes.add('dead-id')
    vi.mocked(rs.pushTombstone).mockRejectedValueOnce(new Error('fail'))
    await pushDirtyNotes()
    expect(pendingDeletes.has('dead-id')).toBe(true)
  })
})

describe('pullAndMerge', () => {
  it('does nothing when offline', async () => {
    vi.mocked(rs.isConnected).mockReturnValue(false)
    await pullAndMerge()
    expect(rs.pullAllNotes).not.toHaveBeenCalled()
  })

  it('inserts a remote note that does not exist locally', async () => {
    const remote: Note = { id: 'remote-1', title: 'Remote', body: 'Body', updatedAt: '2024-01-01T00:00:00.000Z' }
    vi.mocked(rs.pullAllNotes).mockResolvedValue([remote])
    await pullAndMerge()
    expect(notes.get(remote.id)?.title).toBe('Remote')
  })

  it('creates syncMeta with isDirty = false for new remote note', async () => {
    const remote: Note = { id: 'remote-2', title: 'R', body: '', updatedAt: '2024-01-01T00:00:00.000Z' }
    vi.mocked(rs.pullAllNotes).mockResolvedValue([remote])
    await pullAndMerge()
    expect(syncMetaById.get(remote.id)?.isDirty).toBe(false)
  })

  it('overwrites local note when remote updatedAt is newer', async () => {
    const note = await seedNote({ title: 'Old', updatedAt: '2024-01-01T00:00:00.000Z' })
    const remote: Note = { id: note.id, title: 'New', body: 'Updated', updatedAt: '2024-06-01T00:00:00.000Z' }
    vi.mocked(rs.pullAllNotes).mockResolvedValue([remote])
    await pullAndMerge()
    expect(notes.get(note.id)?.title).toBe('New')
  })

  it('keeps local note when local updatedAt is newer', async () => {
    const note = await seedNote({ title: 'Local wins', updatedAt: '2024-12-01T00:00:00.000Z' })
    const remote: Note = { id: note.id, title: 'Old remote', body: '', updatedAt: '2024-01-01T00:00:00.000Z' }
    vi.mocked(rs.pullAllNotes).mockResolvedValue([remote])
    await pullAndMerge()
    expect(notes.get(note.id)?.title).toBe('Local wins')
  })

  it('sets isDirty = false after overwriting with remote', async () => {
    const note = await seedNote({ updatedAt: '2024-01-01T00:00:00.000Z' })
    const remote: Note = { id: note.id, title: 'New', body: '', updatedAt: '2024-06-01T00:00:00.000Z' }
    vi.mocked(rs.pullAllNotes).mockResolvedValue([remote])
    await pullAndMerge()
    expect(syncMetaById.get(note.id)?.isDirty).toBe(false)
  })

  it('deletes local note when remote tombstone exists', async () => {
    const note = await seedNote()
    vi.mocked(rs.listRemoteTombstoneIds).mockResolvedValue([note.id])
    await pullAndMerge()
    expect(notes.has(note.id)).toBe(false)
    expect(syncMetaById.has(note.id)).toBe(false)
  })

  it('clears local pendingDelete when tombstone is already remote', async () => {
    pendingDeletes.add('dead-id')
    vi.mocked(rs.listRemoteTombstoneIds).mockResolvedValue(['dead-id'])
    await pullAndMerge()
    expect(pendingDeletes.has('dead-id')).toBe(false)
  })

  it('does not delete notes not in tombstone list', async () => {
    const note = await seedNote()
    vi.mocked(rs.listRemoteTombstoneIds).mockResolvedValue(['some-other-id'])
    await pullAndMerge()
    expect(notes.has(note.id)).toBe(true)
  })

  it('sets lastPullAt setting after pull', async () => {
    await pullAndMerge()
    expect(settings.get('lastPullAt')).toBeDefined()
  })
})

describe('schedulePush', () => {
  let capturedCallback: (() => Promise<void>) | null = null
  let timerId = 0

  beforeEach(() => {
    capturedCallback = null
    timerId = 0
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: TimerHandler) => {
      capturedCallback = fn as () => Promise<void>
      return ++timerId as unknown as ReturnType<typeof setTimeout>
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not push synchronously', async () => {
    const note = await seedNote()
    schedulePush(note.id)
    expect(rs.pushNote).not.toHaveBeenCalled()
  })

  it('pushes after debounce when connected', async () => {
    const note = await seedNote()
    schedulePush(note.id)
    await capturedCallback?.()
    expect(rs.pushNote).toHaveBeenCalledWith(expect.objectContaining({ id: note.id }))
  })

  it('cancels previous timer when called twice for same note', async () => {
    const note = await seedNote()
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    schedulePush(note.id)
    schedulePush(note.id)
    expect(clearSpy).toHaveBeenCalledWith(1)
    await capturedCallback?.()
    expect(rs.pushNote).toHaveBeenCalledTimes(1)
  })

  it('does not push after debounce when offline', async () => {
    vi.mocked(rs.isConnected).mockReturnValue(false)
    const note = await seedNote()
    schedulePush(note.id)
    await capturedCallback?.()
    expect(rs.pushNote).not.toHaveBeenCalled()
  })

  it('marks syncError when pushNote throws during debounced push', async () => {
    vi.mocked(rs.pushNote).mockRejectedValueOnce(new Error('timeout'))
    const note = await seedNote()
    schedulePush(note.id)
    await capturedCallback?.()
    expect(syncMetaById.get(note.id)?.syncError).toContain('timeout')
  })
})

describe('offline-first scenario', () => {
  it('offline edits accumulate dirty, then sync all on reconnect', async () => {
    vi.mocked(rs.isConnected).mockReturnValue(false)
    const a = await seedNote({ title: 'Note A' })
    const b = await seedNote({ title: 'Note B' })

    expect(vi.mocked(rs.pushNote)).not.toHaveBeenCalled()

    vi.mocked(rs.isConnected).mockReturnValue(true)
    await pushDirtyNotes()

    const pushedIds = vi.mocked(rs.pushNote).mock.calls.map((call) => call[0].id)
    expect(pushedIds).toContain(a.id)
    expect(pushedIds).toContain(b.id)
    expect(syncMetaById.get(a.id)?.isDirty).toBe(false)
    expect(syncMetaById.get(b.id)?.isDirty).toBe(false)
  })

  it('device B receives notes created by device A via pull', async () => {
    const remoteNotes: Note[] = [
      { id: 'a1', title: 'From A', body: 'hello', updatedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'a2', title: 'Also A', body: 'world', updatedAt: '2024-02-01T00:00:00.000Z' },
    ]
    vi.mocked(rs.pullAllNotes).mockResolvedValue(remoteNotes)
    await pullAndMerge()
    expect(notes.get('a1')).toMatchObject({ title: 'From A' })
    expect(notes.get('a2')).toMatchObject({ title: 'Also A' })
  })

  it('conflict: remote wins when remote updatedAt is later', async () => {
    const note = await seedNote({ title: 'Device B version', updatedAt: '2024-01-01T00:00:00.000Z' })
    vi.mocked(rs.pullAllNotes).mockResolvedValue([
      { id: note.id, title: 'Device A version', body: '', updatedAt: '2024-12-01T00:00:00.000Z' },
    ])
    await pullAndMerge()
    expect(notes.get(note.id)?.title).toBe('Device A version')
  })
})
