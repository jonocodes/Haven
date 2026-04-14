import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NotesDB } from '../lib/db'
import type { Note } from '../lib/notes'

let db: NotesDB
let dbId = 0

beforeEach(() => {
  // Unique name per test → fully isolated fake-indexeddb store
  db = new NotesDB(`test-db-${++dbId}`)
})

afterEach(async () => {
  await db.delete()
  db.close()
})

// ─── helpers ─────────────────────────────────────────────────────────────────

async function addNote(overrides: Partial<Note> = {}): Promise<Note> {
  const note: Note = {
    id: crypto.randomUUID(),
    title: 'Test note',
    body: 'Test body',
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
  await db.notes.add(note)
  await db.syncMeta.add({ noteId: note.id, isDirty: true })
  return note
}

// ─── createNote ──────────────────────────────────────────────────────────────

describe('createNote', () => {
  it('stores note with correct fields', async () => {
    const note = await addNote({ title: 'Hello', body: 'World' })
    const stored = await db.notes.get(note.id)
    expect(stored?.title).toBe('Hello')
    expect(stored?.body).toBe('World')
    expect(stored?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
    expect(stored?.archived).toBeUndefined()
  })

  it('creates syncMeta with isDirty = true', async () => {
    const note = await addNote()
    const meta = await db.syncMeta.get(note.id)
    expect(meta?.isDirty).toBe(true)
  })

  it('generates distinct ids for two notes', async () => {
    const a = await addNote()
    const b = await addNote()
    expect(a.id).not.toBe(b.id)
  })
})

// ─── updateNote ──────────────────────────────────────────────────────────────

describe('updateNote', () => {
  it('updates title and body', async () => {
    const note = await addNote({ title: 'Old', body: 'Old body' })
    await db.notes.update(note.id, { title: 'New', body: 'New body', updatedAt: new Date().toISOString() })
    const stored = await db.notes.get(note.id)
    expect(stored?.title).toBe('New')
    expect(stored?.body).toBe('New body')
  })

  it('updates updatedAt to a newer timestamp', async () => {
    const note = await addNote({ updatedAt: '2024-01-01T00:00:00.000Z' })
    await db.notes.update(note.id, { updatedAt: '2025-01-01T00:00:00.000Z' })
    const stored = await db.notes.get(note.id)
    expect(stored?.updatedAt > note.updatedAt).toBe(true)
  })

  it('sets isDirty = true', async () => {
    const note = await addNote()
    await db.syncMeta.update(note.id, { isDirty: false })
    await db.syncMeta.update(note.id, { isDirty: true })
    expect((await db.syncMeta.get(note.id))?.isDirty).toBe(true)
  })

  it('clears syncError', async () => {
    const note = await addNote()
    await db.syncMeta.update(note.id, { syncError: 'previous error' })
    await db.syncMeta.update(note.id, { syncError: undefined })
    expect((await db.syncMeta.get(note.id))?.syncError).toBeUndefined()
  })
})

// ─── archiveNote ─────────────────────────────────────────────────────────────

describe('archiveNote', () => {
  it('sets archived = true', async () => {
    const note = await addNote()
    await db.notes.update(note.id, { archived: true, updatedAt: new Date().toISOString() })
    expect((await db.notes.get(note.id))?.archived).toBe(true)
  })

  it('sets isDirty = true on syncMeta', async () => {
    const note = await addNote()
    await db.syncMeta.update(note.id, { isDirty: false })
    await db.syncMeta.update(note.id, { isDirty: true })
    expect((await db.syncMeta.get(note.id))?.isDirty).toBe(true)
  })
})

// ─── deleteNote ──────────────────────────────────────────────────────────────

describe('deleteNote', () => {
  it('removes note from db.notes', async () => {
    const note = await addNote()
    await db.notes.delete(note.id)
    expect(await db.notes.get(note.id)).toBeUndefined()
  })

  it('removes entry from db.syncMeta', async () => {
    const note = await addNote()
    await db.syncMeta.delete(note.id)
    expect(await db.syncMeta.get(note.id)).toBeUndefined()
  })

  it('adds noteId to db.pendingDeletes', async () => {
    const note = await addNote()
    await db.pendingDeletes.put({ noteId: note.id })
    const rows = await db.pendingDeletes.toArray()
    expect(rows.map((r) => r.noteId)).toContain(note.id)
  })
})

// ─── pendingDeletes ───────────────────────────────────────────────────────────

describe('pendingDeletes', () => {
  it('returns all noteIds', async () => {
    await db.pendingDeletes.put({ noteId: 'a' })
    await db.pendingDeletes.put({ noteId: 'b' })
    const rows = await db.pendingDeletes.toArray()
    expect(rows.map((r) => r.noteId)).toEqual(expect.arrayContaining(['a', 'b']))
  })

  it('clears a specific noteId without affecting others', async () => {
    await db.pendingDeletes.put({ noteId: 'a' })
    await db.pendingDeletes.put({ noteId: 'b' })
    await db.pendingDeletes.delete('a')
    const rows = await db.pendingDeletes.toArray()
    expect(rows.map((r) => r.noteId)).not.toContain('a')
    expect(rows.map((r) => r.noteId)).toContain('b')
  })
})

// ─── listNotes ────────────────────────────────────────────────────────────────

describe('listNotes', () => {
  it('returns notes ordered by updatedAt descending', async () => {
    const a = await addNote({ updatedAt: '2024-01-01T00:00:00.000Z' })
    const b = await addNote({ updatedAt: '2024-06-01T00:00:00.000Z' })
    const c = await addNote({ updatedAt: '2024-03-01T00:00:00.000Z' })
    const all = await db.notes.orderBy('updatedAt').reverse().toArray()
    expect(all[0]?.id).toBe(b.id)
    expect(all[1]?.id).toBe(c.id)
    expect(all[2]?.id).toBe(a.id)
  })

  it('excludes archived notes by default', async () => {
    const active = await addNote()
    const archived = await addNote({ archived: true })
    const visible = (await db.notes.orderBy('updatedAt').reverse().toArray()).filter((n) => !n.archived)
    expect(visible.map((n) => n.id)).toContain(active.id)
    expect(visible.map((n) => n.id)).not.toContain(archived.id)
  })

  it('includes archived notes when requested', async () => {
    const archived = await addNote({ archived: true })
    const all = await db.notes.toArray()
    expect(all.map((n) => n.id)).toContain(archived.id)
  })

  it('returns empty array when no notes exist', async () => {
    expect(await db.notes.toArray()).toHaveLength(0)
  })
})

// ─── getNote ──────────────────────────────────────────────────────────────────

describe('getNote', () => {
  it('returns the note by id', async () => {
    const note = await addNote({ title: 'Find me' })
    expect((await db.notes.get(note.id))?.title).toBe('Find me')
  })

  it('returns undefined for unknown id', async () => {
    expect(await db.notes.get('no-such-id')).toBeUndefined()
  })
})

// ─── getSyncMeta ──────────────────────────────────────────────────────────────

describe('getSyncMeta', () => {
  it('returns syncMeta by noteId', async () => {
    const note = await addNote()
    expect((await db.syncMeta.get(note.id))?.noteId).toBe(note.id)
  })

  it('returns undefined for unknown noteId', async () => {
    expect(await db.syncMeta.get('no-such-id')).toBeUndefined()
  })
})

// ─── markSynced ───────────────────────────────────────────────────────────────

describe('markSynced', () => {
  it('sets isDirty = false', async () => {
    const note = await addNote()
    await db.syncMeta.update(note.id, { isDirty: false, lastConfirmedSyncAt: new Date().toISOString() })
    expect((await db.syncMeta.get(note.id))?.isDirty).toBe(false)
  })

  it('sets lastConfirmedSyncAt', async () => {
    const note = await addNote()
    const before = new Date().toISOString()
    await db.syncMeta.update(note.id, { lastConfirmedSyncAt: new Date().toISOString() })
    expect((await db.syncMeta.get(note.id))?.lastConfirmedSyncAt! >= before).toBe(true)
  })

  it('clears syncError', async () => {
    const note = await addNote()
    await db.syncMeta.update(note.id, { syncError: 'oops' })
    await db.syncMeta.update(note.id, { isDirty: false, syncError: undefined })
    expect((await db.syncMeta.get(note.id))?.syncError).toBeUndefined()
  })
})

// ─── markSyncAttempted ────────────────────────────────────────────────────────

describe('markSyncAttempted', () => {
  it('sets lastAttemptedSyncAt', async () => {
    const note = await addNote()
    const before = new Date().toISOString()
    await db.syncMeta.update(note.id, { lastAttemptedSyncAt: new Date().toISOString() })
    expect((await db.syncMeta.get(note.id))?.lastAttemptedSyncAt! >= before).toBe(true)
  })

  it('does not change isDirty', async () => {
    const note = await addNote()
    await db.syncMeta.update(note.id, { lastAttemptedSyncAt: new Date().toISOString() })
    expect((await db.syncMeta.get(note.id))?.isDirty).toBe(true)
  })
})

// ─── markSyncError ────────────────────────────────────────────────────────────

describe('markSyncError', () => {
  it('sets syncError string', async () => {
    const note = await addNote()
    await db.syncMeta.update(note.id, { syncError: 'network error', lastAttemptedSyncAt: new Date().toISOString() })
    expect((await db.syncMeta.get(note.id))?.syncError).toBe('network error')
  })

  it('sets lastAttemptedSyncAt', async () => {
    const note = await addNote()
    const before = new Date().toISOString()
    await db.syncMeta.update(note.id, { syncError: 'err', lastAttemptedSyncAt: new Date().toISOString() })
    expect((await db.syncMeta.get(note.id))?.lastAttemptedSyncAt! >= before).toBe(true)
  })

  it('does not set isDirty = false', async () => {
    const note = await addNote()
    await db.syncMeta.update(note.id, { syncError: 'err' })
    expect((await db.syncMeta.get(note.id))?.isDirty).toBe(true)
  })
})

// ─── getDirtyNotes ────────────────────────────────────────────────────────────

describe('getDirtyNotes', () => {
  it('only includes notes with isDirty = true', async () => {
    const dirty = await addNote()
    const clean = await addNote()
    await db.syncMeta.update(clean.id, { isDirty: false })
    const allMeta = await db.syncMeta.toArray()
    const dirtyIds = allMeta.filter((m) => m.isDirty).map((m) => m.noteId)
    expect(dirtyIds).toContain(dirty.id)
    expect(dirtyIds).not.toContain(clean.id)
  })

  it('returns empty when all notes are clean', async () => {
    const note = await addNote()
    await db.syncMeta.update(note.id, { isDirty: false })
    const allMeta = await db.syncMeta.toArray()
    expect(allMeta.filter((m) => m.isDirty)).toHaveLength(0)
  })
})

// ─── settings ─────────────────────────────────────────────────────────────────

describe('settings', () => {
  it('stores and retrieves a key-value pair', async () => {
    await db.settings.put({ key: 'foo', value: 'bar' })
    expect((await db.settings.get('foo'))?.value).toBe('bar')
  })

  it('returns undefined for unknown key', async () => {
    expect(await db.settings.get('missing')).toBeUndefined()
  })

  it('overwrites existing key', async () => {
    await db.settings.put({ key: 'k', value: 'v1' })
    await db.settings.put({ key: 'k', value: 'v2' })
    expect((await db.settings.get('k'))?.value).toBe('v2')
  })
})
