import {
  applyRemoteNote,
  applyRemoteTombstone,
  clearPendingDelete,
  getDirtyNotes,
  getRemoteNotePayload,
  getPendingDeletes,
  markSynced,
  markSyncAttempted,
  markSyncError,
  setSetting,
} from './db'
import {
  pushNote,
  pullAllNotes,
  isConnected,
  pushTombstone,
  listRemoteTombstoneIds,
  pullNote,
  hasRemoteTombstone,
} from './remotestorage'
import { publishNoteChanged, subscribeToNoteChanges, type NtfySubscription } from './notify'

const DEFAULT_PUSH_INTERVAL_MS = 5_000
const DEFAULT_PULL_INTERVAL_MS = 5_000

let pushTimer: ReturnType<typeof setInterval> | null = null
let pullTimer: ReturnType<typeof setInterval> | null = null
let ntfySubscription: NtfySubscription | null = null
let pendingNotificationTimer: ReturnType<typeof setTimeout> | null = null
const pendingNotifiedNotes = new Map<string, 'upsert' | 'delete'>()

function queueNtfyTargetedPull(noteId: string, op: 'upsert' | 'delete'): void {
  pendingNotifiedNotes.set(noteId, op)

  if (pendingNotificationTimer) {
    clearTimeout(pendingNotificationTimer)
  }

  pendingNotificationTimer = setTimeout(async () => {
    pendingNotificationTimer = null
    const pending = [...pendingNotifiedNotes.entries()]
    pendingNotifiedNotes.clear()

    for (const [queuedNoteId, queuedOp] of pending) {
      try {
        if (queuedOp === 'delete') {
          const tombstoneExists = await hasRemoteTombstone(queuedNoteId)
          if (tombstoneExists) {
            await applyRemoteTombstone(queuedNoteId)
          }
          continue
        }

        const remote = await pullNote(queuedNoteId)
        if (remote) {
          await applyRemoteNote(remote)
        }
      } catch (error) {
        console.error('Failed targeted pull for notification', queuedNoteId, error)
      }
    }

    await setSetting('lastPullAt', new Date().toISOString())
  }, 500)
}

async function maybePublishNtfy(noteId: string, op: 'upsert' | 'delete'): Promise<void> {
  try {
    await publishNoteChanged(noteId, op)
  } catch (error) {
    console.warn('Failed to publish ntfy event', error)
  }
}

export async function pushDirtyNotes(): Promise<void> {
  if (!isConnected()) return
  const dirty = await getDirtyNotes()
  let pushed = 0
  for (const note of dirty) {
    await markSyncAttempted(note.id)
    try {
      await pushNote(note)
      await markSynced(note.id)
      await maybePublishNtfy(note.id, 'upsert')
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
      await maybePublishNtfy(noteId, 'delete')
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
    await applyRemoteNote(remote)
  }
  // Apply tombstones from remote
  const tombstoneIds = await listRemoteTombstoneIds()
  for (const id of tombstoneIds) {
    await applyRemoteTombstone(id)
  }

  await setSetting('lastPullAt', new Date().toISOString())
}

export function startSyncLoop(options?: { pullIntervalMs?: number }): void {
  stopSyncLoop()
  const pullIntervalMs = options?.pullIntervalMs ?? DEFAULT_PULL_INTERVAL_MS
  pushTimer = setInterval(pushDirtyNotes, DEFAULT_PUSH_INTERVAL_MS)
  pullTimer = setInterval(pullAndMerge, pullIntervalMs)
}

export function stopSyncLoop(): void {
  if (pushTimer) clearInterval(pushTimer)
  if (pullTimer) clearInterval(pullTimer)
  pushTimer = null
  pullTimer = null
}

export async function startNtfyListener(): Promise<void> {
  stopNtfyListener()

  ntfySubscription = await subscribeToNoteChanges(
    ({ noteId, op }) => {
      queueNtfyTargetedPull(noteId, op)
    },
    (error) => {
      console.warn('ntfy listener error', error)
    },
  )
}

export function stopNtfyListener(): void {
  ntfySubscription?.close()
  ntfySubscription = null

  if (pendingNotificationTimer) {
    clearTimeout(pendingNotificationTimer)
    pendingNotificationTimer = null
  }
  pendingNotifiedNotes.clear()
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
      const note = await getRemoteNotePayload(noteId)
      if (!note) return
      await markSyncAttempted(noteId)
      try {
        await pushNote(note)
        await markSynced(noteId)
        await maybePublishNtfy(noteId, 'upsert')
        await setSetting('lastPushAt', new Date().toISOString())
      } catch (err) {
        await markSyncError(noteId, String(err))
      }
    }, 1_000)
  )
}
