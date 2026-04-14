import { db, getDirtyNotes, markSynced, markSyncAttempted, markSyncError, getNote, setSetting, getPendingDeletes, clearPendingDelete } from './db'
import { pushNote, pullAllNotes, isConnected, pushTombstone, listRemoteTombstoneIds } from './remotestorage'
import type { Note } from './notes'

let pushTimer: ReturnType<typeof setInterval> | null = null
let pullTimer: ReturnType<typeof setInterval> | null = null

export async function pushDirtyNotes(): Promise<void> {
  if (!isConnected()) return
  const dirty = await getDirtyNotes()
  let pushed = 0
  for (const note of dirty) {
    await markSyncAttempted(note.id)
    try {
      await pushNote(note)
      await markSynced(note.id)
      pushed++
    } catch (err) {
      await markSyncError(note.id, String(err))
    }
  }
  if (pushed > 0) await setSetting('lastPushAt', new Date().toISOString())

  // Push pending deletes as tombstones
  const pendingDeletes = await getPendingDeletes()
  for (const noteId of pendingDeletes) {
    try {
      await pushTombstone(noteId)
      await clearPendingDelete(noteId)
      if (pushed === 0) await setSetting('lastPushAt', new Date().toISOString())
    } catch (err) {
      console.error('Failed to push tombstone for', noteId, err)
    }
  }
}

export async function pullAndMerge(): Promise<void> {
  if (!isConnected()) return
  const remoteNotes = await pullAllNotes()
  for (const remote of remoteNotes) {
    const local = await getNote(remote.id)
    if (!local) {
      await db.notes.add(remote)
      await db.syncMeta.add({ noteId: remote.id, isDirty: false, lastConfirmedSyncAt: new Date().toISOString() })
    } else if (remote.updatedAt > local.updatedAt) {
      // latest updatedAt wins
      await db.notes.put(remote)
      await db.syncMeta.update(remote.id, { isDirty: false, lastConfirmedSyncAt: new Date().toISOString(), syncError: undefined })
    }
  }
  // Apply tombstones from remote
  const tombstoneIds = await listRemoteTombstoneIds()
  for (const id of tombstoneIds) {
    await db.notes.delete(id)
    await db.syncMeta.delete(id)
    await db.pendingDeletes.delete(id) // in case we also had it pending locally
  }

  await setSetting('lastPullAt', new Date().toISOString())
}

export function startSyncLoop(): void {
  stopSyncLoop()
  pushTimer = setInterval(pushDirtyNotes, 30_000)
  pullTimer = setInterval(pullAndMerge, 60_000)
}

export function stopSyncLoop(): void {
  if (pushTimer) clearInterval(pushTimer)
  if (pullTimer) clearInterval(pullTimer)
  pushTimer = null
  pullTimer = null
}

// Debounced push after local edits
const pendingPush: Map<string, ReturnType<typeof setTimeout>> = new Map()

export function schedulePush(noteId: string): void {
  const existing = pendingPush.get(noteId)
  if (existing) clearTimeout(existing)
  pendingPush.set(
    noteId,
    setTimeout(async () => {
      pendingPush.delete(noteId)
      if (!isConnected()) return
      const note = await getNote(noteId)
      if (!note) return
      await markSyncAttempted(noteId)
      try {
        await pushNote(note)
        await markSynced(noteId)
        await setSetting('lastPushAt', new Date().toISOString())
      } catch (err) {
        await markSyncError(noteId, String(err))
      }
    }, 1_000)
  )
}
