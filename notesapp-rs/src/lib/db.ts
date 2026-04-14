import Dexie, { type Table } from 'dexie'
import type { Note, SyncMetadata } from './notes'

class NotesDB extends Dexie {
  notes!: Table<Note, string>
  syncMeta!: Table<SyncMetadata, string>

  constructor() {
    super('notesapp')
    this.version(1).stores({
      notes: 'id, updatedAt, archived',
      syncMeta: 'noteId',
    })
    this.version(2).stores({
      notes: 'id, updatedAt',
      syncMeta: 'noteId',
    })
  }
}

export const db = new NotesDB()

export async function createNote(title: string, body: string): Promise<Note> {
  const note: Note = {
    id: crypto.randomUUID(),
    title,
    body,
    updatedAt: new Date().toISOString(),
  }
  const meta: SyncMetadata = {
    noteId: note.id,
    isDirty: true,
  }
  await db.notes.add(note)
  await db.syncMeta.add(meta)
  return note
}

export async function updateNote(id: string, changes: Partial<Pick<Note, 'title' | 'body'>>): Promise<void> {
  await db.notes.update(id, { ...changes, updatedAt: new Date().toISOString() })
  await db.syncMeta.update(id, { isDirty: true, syncError: undefined })
}

export async function archiveNote(id: string): Promise<void> {
  await db.notes.update(id, { archived: true, updatedAt: new Date().toISOString() })
  await db.syncMeta.update(id, { isDirty: true })
}

export async function deleteNote(id: string): Promise<void> {
  await db.notes.delete(id)
  await db.syncMeta.delete(id)
}

export async function listNotes(includeArchived = false): Promise<Note[]> {
  const all = await db.notes.orderBy('updatedAt').reverse().toArray()
  return includeArchived ? all : all.filter((n) => !n.archived)
}

export async function getNote(id: string): Promise<Note | undefined> {
  return db.notes.get(id)
}

export async function getSyncMeta(noteId: string): Promise<SyncMetadata | undefined> {
  return db.syncMeta.get(noteId)
}

export async function markSynced(noteId: string): Promise<void> {
  await db.syncMeta.update(noteId, {
    isDirty: false,
    lastConfirmedSyncAt: new Date().toISOString(),
    syncError: undefined,
  })
}

export async function markSyncAttempted(noteId: string): Promise<void> {
  await db.syncMeta.update(noteId, { lastAttemptedSyncAt: new Date().toISOString() })
}

export async function markSyncError(noteId: string, error: string): Promise<void> {
  await db.syncMeta.update(noteId, { syncError: error, lastAttemptedSyncAt: new Date().toISOString() })
}

export async function getDirtyNotes(): Promise<Array<Note & { meta: SyncMetadata }>> {
  const allMeta = await db.syncMeta.toArray()
  const dirtyMeta = allMeta.filter((m) => m.isDirty)
  const results = await Promise.all(
    dirtyMeta.map(async (meta) => {
      const note = await db.notes.get(meta.noteId)
      return note ? { ...note, meta } : null
    })
  )
  return results.filter((n): n is Note & { meta: SyncMetadata } => n !== null)
}
