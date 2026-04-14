import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { NotesDB } from '../lib/db'
import type { Note, SyncMetadata } from '../lib/notes'

// testDb is set in beforeEach — all mock functions close over this variable
// so they always use the fresh per-test instance
let testDb!: NotesDB
let dbId = 0

vi.mock('../lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/db')>()
  return {
    NotesDB: actual.NotesDB,
    getDb: () => testDb,
    getDirtyNotes: async () => {
      const allMeta = await testDb.syncMeta.toArray()
      const dirtyMeta = allMeta.filter((m: SyncMetadata) => m.isDirty)
      const results = await Promise.all(
        dirtyMeta.map(async (meta: SyncMetadata) => {
          const note = await testDb.notes.get(meta.noteId)
          return note ? { ...note, meta } : null
        })
      )
      return results.filter((n: unknown): n is Note & { meta: SyncMetadata } => n !== null)
    },
    markSynced: async (noteId: string) => {
      await testDb.syncMeta.update(noteId, {
        isDirty: false,
        lastConfirmedSyncAt: new Date().toISOString(),
        syncError: undefined,
      })
    },
    markSyncAttempted: async (noteId: string) => {
      await testDb.syncMeta.update(noteId, { lastAttemptedSyncAt: new Date().toISOString() })
    },
    markSyncError: async (noteId: string, error: string) => {
      await testDb.syncMeta.update(noteId, { syncError: error, lastAttemptedSyncAt: new Date().toISOString() })
    },
    getNote: async (id: string) => testDb.notes.get(id),
    setSetting: async (key: string, value: string) => testDb.settings.put({ key, value }),
    getPendingDeletes: async () => {
      const rows = await testDb.pendingDeletes.toArray()
      return rows.map((r: { noteId: string }) => r.noteId)
    },
    clearPendingDelete: async (noteId: string) => testDb.pendingDeletes.delete(noteId),
  }
})

vi.mock('../lib/remotestorage', () => ({
  isConnected: vi.fn(),
  pushNote: vi.fn(),
  pullAllNotes: vi.fn(),
  pushTombstone: vi.fn(),
  listRemoteTombstoneIds: vi.fn(),
}))

import * as rs from '../lib/remotestorage'
import { pushDirtyNotes, pullAndMerge, schedulePush } from '../lib/sync'

beforeEach(() => {
  testDb = new NotesDB(`sync-test-${++dbId}`)
  vi.mocked(rs.isConnected).mockReturnValue(true)
  vi.mocked(rs.pushNote).mockResolvedValue(undefined)
  vi.mocked(rs.pullAllNotes).mockResolvedValue([])
  vi.mocked(rs.pushTombstone).mockResolvedValue(undefined)
  vi.mocked(rs.listRemoteTombstoneIds).mockResolvedValue([])
})

afterEach(async () => {
  vi.clearAllTimers()  // discard any pending fake timers before restoring
  vi.clearAllMocks()
  vi.useRealTimers()
  await testDb.delete()
  testDb.close()
})

// ─── helpers ────────────────────────────────────────────────────────────────

async function seedNote(overrides: Partial<Note> = {}): Promise<Note> {
  const note: Note = {
    id: crypto.randomUUID(),
    title: 'Note',
    body: 'Body',
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
  await testDb.notes.add(note)
  await testDb.syncMeta.add({ noteId: note.id, isDirty: true })
  return note
}

// ─── pushDirtyNotes ──────────────────────────────────────────────────────────

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
    const pushedIds = vi.mocked(rs.pushNote).mock.calls.map((c) => c[0].id)
    expect(pushedIds).toContain(a.id)
    expect(pushedIds).toContain(b.id)
  })

  it('does not push clean notes', async () => {
    const note = await seedNote()
    await testDb.syncMeta.update(note.id, { isDirty: false })
    await pushDirtyNotes()
    expect(rs.pushNote).not.toHaveBeenCalled()
  })

  it('sets lastPushAt setting when notes are pushed', async () => {
    await seedNote()
    await pushDirtyNotes()
    const setting = await testDb.settings.get('lastPushAt')
    expect(setting?.value).toBeDefined()
  })

  it('does not set lastPushAt when no dirty notes', async () => {
    await pushDirtyNotes()
    expect(await testDb.settings.get('lastPushAt')).toBeUndefined()
  })

  it('records syncError when pushNote throws', async () => {
    const note = await seedNote()
    vi.mocked(rs.pushNote).mockRejectedValueOnce(new Error('network fail'))
    await pushDirtyNotes()
    const meta = await testDb.syncMeta.get(note.id)
    expect(meta?.syncError).toContain('network fail')
  })

  it('continues pushing other notes after one failure', async () => {
    await seedNote()
    const b = await seedNote()
    vi.mocked(rs.pushNote)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(undefined)
    await pushDirtyNotes()
    expect(rs.pushNote).toHaveBeenCalledTimes(2)
    const metaB = await testDb.syncMeta.get(b.id)
    expect(metaB?.isDirty).toBe(false)
  })

  it('pushes tombstones for pending deletes', async () => {
    await testDb.pendingDeletes.put({ noteId: 'dead-id' })
    await pushDirtyNotes()
    expect(rs.pushTombstone).toHaveBeenCalledWith('dead-id')
  })

  it('clears pending delete after successful tombstone push', async () => {
    await testDb.pendingDeletes.put({ noteId: 'dead-id' })
    await pushDirtyNotes()
    expect(await testDb.pendingDeletes.get('dead-id')).toBeUndefined()
  })

  it('does not clear pending delete when pushTombstone throws', async () => {
    await testDb.pendingDeletes.put({ noteId: 'dead-id' })
    vi.mocked(rs.pushTombstone).mockRejectedValueOnce(new Error('fail'))
    await pushDirtyNotes()
    expect(await testDb.pendingDeletes.get('dead-id')).toBeDefined()
  })
})

// ─── pullAndMerge ────────────────────────────────────────────────────────────

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
    const stored = await testDb.notes.get('remote-1')
    expect(stored?.title).toBe('Remote')
  })

  it('creates syncMeta with isDirty = false for new remote note', async () => {
    const remote: Note = { id: 'remote-2', title: 'R', body: '', updatedAt: '2024-01-01T00:00:00.000Z' }
    vi.mocked(rs.pullAllNotes).mockResolvedValue([remote])
    await pullAndMerge()
    const meta = await testDb.syncMeta.get('remote-2')
    expect(meta?.isDirty).toBe(false)
  })

  it('overwrites local note when remote updatedAt is newer', async () => {
    const note = await seedNote({ title: 'Old', updatedAt: '2024-01-01T00:00:00.000Z' })
    const remote: Note = { id: note.id, title: 'New', body: 'Updated', updatedAt: '2024-06-01T00:00:00.000Z' }
    vi.mocked(rs.pullAllNotes).mockResolvedValue([remote])
    await pullAndMerge()
    const stored = await testDb.notes.get(note.id)
    expect(stored?.title).toBe('New')
  })

  it('keeps local note when local updatedAt is newer', async () => {
    const note = await seedNote({ title: 'Local wins', updatedAt: '2024-12-01T00:00:00.000Z' })
    const remote: Note = { id: note.id, title: 'Old remote', body: '', updatedAt: '2024-01-01T00:00:00.000Z' }
    vi.mocked(rs.pullAllNotes).mockResolvedValue([remote])
    await pullAndMerge()
    const stored = await testDb.notes.get(note.id)
    expect(stored?.title).toBe('Local wins')
  })

  it('sets isDirty = false after overwriting with remote', async () => {
    const note = await seedNote({ updatedAt: '2024-01-01T00:00:00.000Z' })
    const remote: Note = { id: note.id, title: 'New', body: '', updatedAt: '2024-06-01T00:00:00.000Z' }
    vi.mocked(rs.pullAllNotes).mockResolvedValue([remote])
    await pullAndMerge()
    const meta = await testDb.syncMeta.get(note.id)
    expect(meta?.isDirty).toBe(false)
  })

  it('deletes local note when remote tombstone exists', async () => {
    const note = await seedNote()
    vi.mocked(rs.listRemoteTombstoneIds).mockResolvedValue([note.id])
    await pullAndMerge()
    expect(await testDb.notes.get(note.id)).toBeUndefined()
    expect(await testDb.syncMeta.get(note.id)).toBeUndefined()
  })

  it('clears local pendingDelete when tombstone is already remote', async () => {
    await testDb.pendingDeletes.put({ noteId: 'dead-id' })
    vi.mocked(rs.listRemoteTombstoneIds).mockResolvedValue(['dead-id'])
    await pullAndMerge()
    expect(await testDb.pendingDeletes.get('dead-id')).toBeUndefined()
  })

  it('does not delete notes not in tombstone list', async () => {
    const note = await seedNote()
    vi.mocked(rs.listRemoteTombstoneIds).mockResolvedValue(['some-other-id'])
    await pullAndMerge()
    expect(await testDb.notes.get(note.id)).toBeDefined()
  })

  it('sets lastPullAt setting after pull', async () => {
    await pullAndMerge()
    const setting = await testDb.settings.get('lastPullAt')
    expect(setting?.value).toBeDefined()
  })
})

// ─── schedulePush ────────────────────────────────────────────────────────────
// We spy on setTimeout to capture the debounced callback and call it directly,
// which avoids fake-timer / Dexie async compatibility issues.

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
    await capturedCallback!()
    expect(rs.pushNote).toHaveBeenCalledWith(expect.objectContaining({ id: note.id }))
  })

  it('cancels previous timer when called twice for same note', async () => {
    const note = await seedNote()
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    schedulePush(note.id)  // sets timerId=1
    schedulePush(note.id)  // cancels timerId=1, sets timerId=2
    expect(clearSpy).toHaveBeenCalledWith(1)
    await capturedCallback!()  // runs the second (and only surviving) callback
    expect(rs.pushNote).toHaveBeenCalledTimes(1)
  })

  it('does not push after debounce when offline', async () => {
    vi.mocked(rs.isConnected).mockReturnValue(false)
    const note = await seedNote()
    schedulePush(note.id)
    await capturedCallback!()
    expect(rs.pushNote).not.toHaveBeenCalled()
  })

  it('marks syncError when pushNote throws during debounced push', async () => {
    vi.mocked(rs.pushNote).mockRejectedValueOnce(new Error('timeout'))
    const note = await seedNote()
    schedulePush(note.id)
    await capturedCallback!()
    const meta = await testDb.syncMeta.get(note.id)
    expect(meta?.syncError).toContain('timeout')
  })
})

// ─── offline-first integration ───────────────────────────────────────────────

describe('offline-first scenario', () => {
  it('offline edits accumulate dirty, then sync all on reconnect', async () => {
    vi.mocked(rs.isConnected).mockReturnValue(false)
    const a = await seedNote({ title: 'Note A' })
    const b = await seedNote({ title: 'Note B' })

    expect(vi.mocked(rs.pushNote)).not.toHaveBeenCalled()

    vi.mocked(rs.isConnected).mockReturnValue(true)
    await pushDirtyNotes()

    const pushedIds = vi.mocked(rs.pushNote).mock.calls.map((c) => c[0].id)
    expect(pushedIds).toContain(a.id)
    expect(pushedIds).toContain(b.id)

    expect((await testDb.syncMeta.get(a.id))?.isDirty).toBe(false)
    expect((await testDb.syncMeta.get(b.id))?.isDirty).toBe(false)
  })

  it('device B receives notes created by device A via pull', async () => {
    const remoteNotes: Note[] = [
      { id: 'a1', title: 'From A', body: 'hello', updatedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'a2', title: 'Also A', body: 'world', updatedAt: '2024-02-01T00:00:00.000Z' },
    ]
    vi.mocked(rs.pullAllNotes).mockResolvedValue(remoteNotes)
    await pullAndMerge()
    expect(await testDb.notes.get('a1')).toMatchObject({ title: 'From A' })
    expect(await testDb.notes.get('a2')).toMatchObject({ title: 'Also A' })
  })

  it('conflict: remote wins when remote updatedAt is later', async () => {
    const note = await seedNote({ title: 'Device B version', updatedAt: '2024-01-01T00:00:00.000Z' })
    vi.mocked(rs.pullAllNotes).mockResolvedValue([
      { id: note.id, title: 'Device A version', body: '', updatedAt: '2024-12-01T00:00:00.000Z' },
    ])
    await pullAndMerge()
    expect((await testDb.notes.get(note.id))?.title).toBe('Device A version')
  })
})
