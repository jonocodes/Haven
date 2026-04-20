import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { replaceBodyText } from '../lib/crdt'
import type { RemoteNote } from '../lib/notes'
import {
  applyBodyUpdate,
  clearPendingDelete,
  createNote,
  deleteNote,
  getBodyCrdtState,
  getNote,
  getPendingDeletes,
  getSyncMeta,
  markSynced,
  setSetting,
} from '../lib/db'
import { resetRxDbForTests } from '../lib/rxdb'

vi.mock('../lib/remotestorage', () => ({
  isConnected: vi.fn(),
  pushNote: vi.fn(),
  pullAllNotes: vi.fn(),
  pushTombstone: vi.fn(),
  listRemoteTombstoneIds: vi.fn(),
  pullNote: vi.fn(),
  hasRemoteTombstone: vi.fn(),
}))


vi.mock('../lib/notify', () => ({
  publishNoteChanged: vi.fn(),
  subscribeToNoteChanges: vi.fn(),
}))


import * as rs from '../lib/remotestorage'
import { pullAndMerge, pushDirtyNotes, schedulePush } from '../lib/sync'

beforeEach(async () => {
  await resetRxDbForTests()
  vi.mocked(rs.isConnected).mockReturnValue(true)
  vi.mocked(rs.pushNote).mockResolvedValue(undefined)
  vi.mocked(rs.pullAllNotes).mockResolvedValue([])
  vi.mocked(rs.pushTombstone).mockResolvedValue(undefined)
  vi.mocked(rs.listRemoteTombstoneIds).mockResolvedValue([])
  vi.mocked(rs.pullNote).mockResolvedValue(null)
  vi.mocked(rs.hasRemoteTombstone).mockResolvedValue(false)
})

afterEach(async () => {
  vi.clearAllMocks()
  vi.useRealTimers()
  await resetRxDbForTests()
})

async function createSyncedNote(title = 'Note', body = 'Body') {
  const note = await createNote(title, body)
  await markSynced(note.id)
  return note
}

describe('pushDirtyNotes', () => {
  it('does nothing when offline', async () => {
    vi.mocked(rs.isConnected).mockReturnValue(false)
    await createSyncedNote()
    await applyBodyUpdate((await createSyncedNote()).id, 'dirty')
    await pushDirtyNotes()
    expect(rs.pushNote).not.toHaveBeenCalled()
  })

  it('pushes dirty notes including merged CRDT state', async () => {
    const local = await createSyncedNote('Shared', 'alpha')
    const baseState = await getBodyCrdtState(local.id)
    await applyBodyUpdate(local.id, 'alpha local')

    const remoteState = replaceBodyText(baseState!, 'alpha remote')
    const remotePayload: RemoteNote = {
      id: local.id,
      title: 'Shared',
      body: 'alpha remote',
      updatedAt: '2026-01-01T00:00:00.000Z',
      crdtState: remoteState,
    }
    vi.mocked(rs.pullAllNotes).mockResolvedValue([remotePayload])

    await pullAndMerge()
    await pushDirtyNotes()

    expect(rs.pushNote).toHaveBeenCalledTimes(1)
    const pushed = vi.mocked(rs.pushNote).mock.calls[0][0]
    expect(pushed.body).toContain('local')
    expect(pushed.body).toContain('remote')
    expect((await getSyncMeta(local.id))?.isDirty).toBe(false)
  })

  it('pushes tombstones for pending deletes', async () => {
    const doomed = await createSyncedNote('Delete me', 'Body')
    await deleteNote(doomed.id)

    await pushDirtyNotes()

    expect(rs.pushTombstone).toHaveBeenCalledWith(doomed.id)
    expect(await getPendingDeletes()).not.toContain(doomed.id)
  })

  it('does not clear pending delete when pushTombstone throws', async () => {
    const doomed = await createSyncedNote('Delete me', 'Body')
    await deleteNote(doomed.id)
    vi.mocked(rs.pushTombstone).mockRejectedValueOnce(new Error('fail'))

    await pushDirtyNotes()

    expect(await getPendingDeletes()).toContain(doomed.id)
  })
})

describe('pullAndMerge CRDT behavior', () => {
  it('merges concurrent local + remote body edits instead of last-write-wins overwrite', async () => {
    const note = await createSyncedNote('Shared', 'alpha')
    const baseState = await getBodyCrdtState(note.id)

    await applyBodyUpdate(note.id, 'alpha local')

    vi.mocked(rs.pullAllNotes).mockResolvedValue([
      {
        id: note.id,
        title: 'Shared',
        body: 'alpha remote',
        updatedAt: '2026-01-01T00:00:00.000Z',
        crdtState: replaceBodyText(baseState!, 'alpha remote'),
      },
    ])

    await pullAndMerge()

    const merged = await getNote(note.id)
    expect(merged?.body).toContain('local')
    expect(merged?.body).toContain('remote')
  })

  it('applies title updates without clobbering locally edited body', async () => {
    const note = await createSyncedNote('Original title', 'alpha')
    const baseState = await getBodyCrdtState(note.id)

    await applyBodyUpdate(note.id, 'alpha local')

    vi.mocked(rs.pullAllNotes).mockResolvedValue([
      {
        id: note.id,
        title: 'Remote title',
        body: 'alpha',
        updatedAt: '2099-01-01T00:00:00.000Z',
        crdtState: baseState!,
      },
    ])

    await pullAndMerge()

    const merged = await getNote(note.id)
    expect(merged?.title).toBe('Remote title')
    expect(merged?.body).toContain('local')
  })

  it('applies remote tombstones and clears local pending deletes', async () => {
    const doomed = await createSyncedNote('Delete me', 'Body')
    await deleteNote(doomed.id)
    await clearPendingDelete(doomed.id)

    await createSyncedNote('Other', 'Body')
    vi.mocked(rs.listRemoteTombstoneIds).mockResolvedValue([doomed.id])

    await pullAndMerge()

    expect(await getNote(doomed.id)).toBeUndefined()
    expect(await getPendingDeletes()).not.toContain(doomed.id)
  })
})



describe('offline multi-device scenarios', () => {
  it('merges offline edits from two devices after reconnect and pushes merged state', async () => {
    const note = await createSyncedNote('Shared', 'alpha')
    const baseState = await getBodyCrdtState(note.id)

    // Device A edits locally while offline.
    vi.mocked(rs.isConnected).mockReturnValue(false)
    await applyBodyUpdate(note.id, 'alpha local offline')

    await pushDirtyNotes()
    expect(rs.pushNote).not.toHaveBeenCalled()

    // Device B edits the same base state while A is offline.
    const remotePayload: RemoteNote = {
      id: note.id,
      title: 'Shared',
      body: 'alpha remote offline',
      updatedAt: '2026-01-02T00:00:00.000Z',
      crdtState: replaceBodyText(baseState!, 'alpha remote offline'),
    }

    // A reconnects, pulls B, merges, then pushes merged body.
    vi.mocked(rs.isConnected).mockReturnValue(true)
    vi.mocked(rs.pullAllNotes).mockResolvedValue([remotePayload])

    await pullAndMerge()
    const mergedAfterPull = await getNote(note.id)
    expect(mergedAfterPull?.body).toContain('local')
    expect(mergedAfterPull?.body).toContain('remote')
    expect((await getSyncMeta(note.id))?.isDirty).toBe(true)

    await pushDirtyNotes()

    expect(rs.pushNote).toHaveBeenCalledTimes(1)
    const pushed = vi.mocked(rs.pushNote).mock.calls[0][0]
    expect(pushed.body).toContain('local')
    expect(pushed.body).toContain('remote')
    expect((await getSyncMeta(note.id))?.isDirty).toBe(false)
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
    const note = await createSyncedNote()
    await applyBodyUpdate(note.id, 'dirty')
    schedulePush(note.id)
    expect(rs.pushNote).not.toHaveBeenCalled()
  })

  it('pushes after debounce when connected', async () => {
    const note = await createSyncedNote()
    await applyBodyUpdate(note.id, 'dirty')
    schedulePush(note.id)
    await capturedCallback?.()
    expect(rs.pushNote).toHaveBeenCalledWith(expect.objectContaining({ id: note.id }))
  })

  it('cancels previous timer when called twice for same note', async () => {
    const note = await createSyncedNote()
    await applyBodyUpdate(note.id, 'dirty')
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    schedulePush(note.id)
    schedulePush(note.id)
    expect(clearSpy).toHaveBeenCalledTimes(1)
    await capturedCallback?.()
    expect(rs.pushNote).toHaveBeenCalledTimes(1)
  })

  it('does not push after debounce when offline', async () => {
    vi.mocked(rs.isConnected).mockReturnValue(false)
    const note = await createSyncedNote()
    await applyBodyUpdate(note.id, 'dirty')
    schedulePush(note.id)
    await capturedCallback?.()
    expect(rs.pushNote).not.toHaveBeenCalled()
  })

  it('sets lastPushAt after successful debounced push', async () => {
    const note = await createSyncedNote()
    await applyBodyUpdate(note.id, 'dirty')
    await setSetting('lastPushAt', '')

    schedulePush(note.id)
    await capturedCallback?.()

    expect((await getSyncMeta(note.id))?.isDirty).toBe(false)
  })
})
