import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getTextFromBodyState, mergeBodyStates, replaceBodyText } from '../lib/crdt'
import type { Note } from '../lib/notes'
import {
  applyBodyUpdate,
  applyRemoteNote,
  applyRemoteTombstone,
  archiveNote,
  clearPendingDelete,
  createNote,
  deleteNote,
  getBodyCrdtState,
  getBodyText,
  getDirtyNotes,
  getNote,
  getPendingDeletes,
  getSetting,
  getSyncMeta,
  listNotes,
  markSynced,
  setSetting,
  updateNote,
  updateNoteTitle,
} from '../lib/db'
import { getRxCollections, resetRxDbForTests } from '../lib/rxdb'

describe('db facade', () => {
  beforeEach(async () => {
    await resetRxDbForTests()
  })

  afterEach(async () => {
    await resetRxDbForTests()
  })

  async function createSeedNote(overrides: Partial<Note> = {}): Promise<Note> {
    const note = await createNote(overrides.title ?? 'Test note', overrides.body ?? 'Test body')
    if (overrides.title !== undefined || overrides.body !== undefined) {
      await updateNote(note.id, {
        ...(overrides.title !== undefined ? { title: overrides.title } : {}),
        ...(overrides.body !== undefined ? { body: overrides.body } : {}),
      })
      await markSynced(note.id)
    }
    if (overrides.archived) {
      await archiveNote(note.id)
      await markSynced(note.id)
    }
    if (overrides.updatedAt) {
      await applyRemoteNote({ ...(await getNote(note.id))!, updatedAt: overrides.updatedAt })
    }
    return (await getNote(note.id))!
  }

  it('createNote stores split meta/content docs and dirty sync metadata', async () => {
    const note = await createNote('Hello', 'World')
    const collections = await getRxCollections()
    const [metaDoc, contentDoc, syncMeta] = await Promise.all([
      collections.notesMeta.findOne(note.id).exec(),
      collections.notesContent.findOne(note.id).exec(),
      getSyncMeta(note.id),
    ])

    expect(metaDoc?.title).toBe('Hello')
    expect(contentDoc?.plainText).toBe('World')
    expect(syncMeta?.isDirty).toBe(true)
  })

  it('getNote joins metadata and content into the public Note shape', async () => {
    const note = await createNote('Joined', 'Body text')
    expect(await getNote(note.id)).toMatchObject({
      id: note.id,
      title: 'Joined',
      body: 'Body text',
    })
  })

  it('listNotes orders by updatedAt descending and excludes archived by default', async () => {
    const a = await createSeedNote({ title: 'A', updatedAt: '2024-01-01T00:00:00.000Z' })
    const b = await createSeedNote({ title: 'B', updatedAt: '2024-06-01T00:00:00.000Z' })
    const archived = await createSeedNote({ title: 'Archived', archived: true, updatedAt: '2024-12-01T00:00:00.000Z' })

    const visible = await listNotes()
    const all = await listNotes(true)

    expect(visible.map((note) => note.id)).toEqual([b.id, a.id])
    expect(all.map((note) => note.id)).toContain(archived.id)
  })

  it('updateNote and title/body helpers update the note body facade and CRDT placeholder', async () => {
    const note = await createNote('Old title', 'Old body')
    await updateNoteTitle(note.id, 'New title')
    await applyBodyUpdate(note.id, 'New body')

    expect(await getBodyText(note.id)).toBe('New body')
    expect(getTextFromBodyState((await getBodyCrdtState(note.id))!)).toBe('New body')
    expect(await getNote(note.id)).toMatchObject({
      title: 'New title',
      body: 'New body',
    })
  })

  it('applyRemoteNote merges concurrent body changes by CRDT state', async () => {
    const local = await createNote('Shared', 'alpha')
    const localState = await getBodyCrdtState(local.id)
    await applyBodyUpdate(local.id, 'alpha local')

    await applyRemoteNote({
      id: local.id,
      title: 'Shared',
      body: 'alpha remote',
      updatedAt: local.updatedAt,
      crdtState: (() => {
        return replaceBodyText(localState!, 'alpha remote')
      })(),
    })

    const merged = await getNote(local.id)
    expect(merged?.body).toContain('alpha')
    expect(merged?.body).toContain('local')
    expect(merged?.body).toContain('remote')
  })

  it('mergeBodyStates is deterministic for overlapping insert/delete edits', () => {
    const base = replaceBodyText(undefined, 'alpha beta')
    const deleteState = replaceBodyText(base, 'alpha ')
    const insertState = replaceBodyText(base, 'alpha Xbeta')

    const mergedDeleteFirst = mergeBodyStates(deleteState, insertState)
    const mergedInsertFirst = mergeBodyStates(insertState, deleteState)

    expect(getTextFromBodyState(mergedDeleteFirst)).toBe('alpha X')
    expect(getTextFromBodyState(mergedInsertFirst)).toBe('alpha X')
    expect(mergedDeleteFirst).toBe(mergedInsertFirst)
  })

  it('applyRemoteNote keeps the note dirty when merged content still contains local-only changes', async () => {
    const note = await createNote('Shared', 'alpha')
    const baseState = await getBodyCrdtState(note.id)
    await applyBodyUpdate(note.id, 'alpha local')

    await applyRemoteNote({
      id: note.id,
      title: 'Shared',
      body: 'alpha remote',
      updatedAt: note.updatedAt,
      crdtState: replaceBodyText(baseState!, 'alpha remote'),
    })

    expect((await getSyncMeta(note.id))?.isDirty).toBe(true)
  })

  it('applyRemoteNote persists incoming share metadata', async () => {
    const note = await createNote('Shared', 'Body')

    await applyRemoteNote({
      id: note.id,
      title: 'Shared',
      body: 'Body',
      updatedAt: new Date(Date.now() + 1_000).toISOString(),
      share: {
        published: true,
        shareId: 'sh_public123',
        publishedAt: '2026-04-20T00:00:00.000Z',
      },
    })

    expect(await getNote(note.id)).toMatchObject({
      share: {
        published: true,
        shareId: 'sh_public123',
        publishedAt: '2026-04-20T00:00:00.000Z',
      },
    })
  })

  it('deleteNote removes split docs and records a pending tombstone', async () => {
    const note = await createNote('To delete', 'Body')
    await deleteNote(note.id)

    expect(await getNote(note.id)).toBeUndefined()
    expect(await getPendingDeletes()).toContain(note.id)
  })

  it('applyRemoteTombstone removes the note and clears pending deletes', async () => {
    const note = await createNote('Remote tombstone', 'Body')
    await deleteNote(note.id)
    await applyRemoteTombstone(note.id)

    expect(await getNote(note.id)).toBeUndefined()
    expect(await getPendingDeletes()).not.toContain(note.id)
  })

  it('getDirtyNotes only returns notes whose sync metadata is dirty', async () => {
    const dirty = await createNote('Dirty', 'Body')
    const clean = await createNote('Clean', 'Body')
    await markSynced(clean.id)

    const dirtyNotes = await getDirtyNotes()
    expect(dirtyNotes.map((note) => note.id)).toContain(dirty.id)
    expect(dirtyNotes.map((note) => note.id)).not.toContain(clean.id)
  })

  it('settings store and retrieve values', async () => {
    await setSetting('foo', 'bar')
    expect(await getSetting('foo')).toBe('bar')
  })

  it('clearPendingDelete removes only the specified tombstone', async () => {
    const a = await createNote('A', 'Body')
    const b = await createNote('B', 'Body')
    await deleteNote(a.id)
    await deleteNote(b.id)

    await clearPendingDelete(a.id)

    expect(await getPendingDeletes()).not.toContain(a.id)
    expect(await getPendingDeletes()).toContain(b.id)
  })
})
