import { db, getDirtyNotes, markSynced, markSyncAttempted, markSyncError, getNote } from './db'
import { pushNote, pullAllNotes, isConnected } from './remotestorage'
import type { Note } from './notes'

let pushTimer: ReturnType<typeof setInterval> | null = null
let pullTimer: ReturnType<typeof setInterval> | null = null

export async function pushDirtyNotes(): Promise<void> {
  if (!isConnected()) return
  const dirty = await getDirtyNotes()
  for (const note of dirty) {
    await markSyncAttempted(note.id)
    try {
      await pushNote(note)
      await markSynced(note.id)
    } catch (err) {
      await markSyncError(note.id, String(err))
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
      } catch (err) {
        await markSyncError(noteId, String(err))
      }
    }, 1_000)
  )
}
