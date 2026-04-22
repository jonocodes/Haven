import { combineLatest, map, type Observable } from 'rxjs'
import { createBodyState, getTextFromBodyState, mergeBodyStates, replaceBodyText } from './crdt'
import type { Note, NoteShareState, RemoteNote, SyncMetadata } from './notes'
import {
  getRxCollections,
  type NoteContentDoc,
  type NoteMetaDoc,
} from './rxdb'

function nowIso(): string {
  return new Date().toISOString()
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as T
}

function hydrateNote(meta: NoteMetaDoc, content: NoteContentDoc): Note {
  const share: NoteShareState | undefined = meta.sharePublished || meta.shareId || meta.sharePublishedAt
    ? {
        published: meta.sharePublished ?? false,
        shareId: meta.shareId ?? null,
        publishedAt: meta.sharePublishedAt ?? null,
      }
    : undefined

  return {
    id: meta.id,
    title: meta.title,
    body: content.plainText,
    archived: meta.archived,
    updatedAt: meta.updatedAt,
    share,
  }
}

async function getNoteParts(noteId: string): Promise<{ meta?: NoteMetaDoc; content?: NoteContentDoc }> {
  const collections = await getRxCollections()
  const [metaDoc, contentDoc] = await Promise.all([
    collections.notesMeta.findOne(noteId).exec(),
    collections.notesContent.findOne(noteId).exec(),
  ])

  return {
    meta: metaDoc?.toJSON(),
    content: contentDoc?.toJSON(),
  }
}

async function upsertNoteParts(note: RemoteNote): Promise<void> {
  const collections = await getRxCollections()
  const crdtState = note.crdtState ?? createBodyState(note.body)
  await collections.notesContent.upsert({
    id: note.id,
    plainText: note.body,
    crdtState,
    updatedAt: note.updatedAt,
  })
  await collections.notesMeta.upsert(stripUndefined({
    id: note.id,
    title: note.title,
    archived: note.archived,
    updatedAt: note.updatedAt,
    sharePublished: note.share?.published,
    shareId: note.share?.shareId ?? undefined,
    sharePublishedAt: note.share?.publishedAt ?? undefined,
  }))
}

async function removeNoteParts(noteId: string): Promise<void> {
  const collections = await getRxCollections()
  const [metaDoc, contentDoc] = await Promise.all([
    collections.notesMeta.findOne(noteId).exec(),
    collections.notesContent.findOne(noteId).exec(),
  ])

  await Promise.all([
    metaDoc?.remove(),
    contentDoc?.remove(),
  ])
}

async function upsertSyncMeta(noteId: string, changes: Partial<SyncMetadata>): Promise<void> {
  const collections = await getRxCollections()
  const current = await collections.syncMeta.findOne(noteId).exec()

  if (current) {
    await current.incrementalModify((data) => stripUndefined({
      ...data,
      ...changes,
      noteId,
    }))
    return
  }

  await collections.syncMeta.insert(stripUndefined({
    noteId,
    isDirty: changes.isDirty ?? true,
    lastAttemptedSyncAt: changes.lastAttemptedSyncAt,
    lastConfirmedSyncAt: changes.lastConfirmedSyncAt,
    syncError: changes.syncError,
  }))
}

export async function createNote(title: string, body: string): Promise<Note> {
  const note: Note = {
    id: crypto.randomUUID(),
    title,
    body,
    updatedAt: nowIso(),
  }
  await upsertNoteParts(note)
  await upsertSyncMeta(note.id, { isDirty: true })
  return note
}

export async function updateNote(id: string, changes: Partial<Pick<Note, 'title' | 'body'>>): Promise<void> {
  const collections = await getRxCollections()
  const [metaDoc, contentDoc] = await Promise.all([
    collections.notesMeta.findOne(id).exec(),
    collections.notesContent.findOne(id).exec(),
  ])
  const updatedAt = nowIso()

  if (contentDoc && changes.body !== undefined) {
    const nextState = replaceBodyText(contentDoc.crdtState, changes.body)
    await contentDoc.incrementalPatch({
      plainText: changes.body,
      crdtState: nextState,
      updatedAt,
    })
  }

  if (metaDoc) {
    await metaDoc.incrementalPatch(stripUndefined({
      title: changes.title,
      updatedAt,
    }))
  }

  await upsertSyncMeta(id, { isDirty: true, syncError: undefined })
}

export async function updateNoteShare(id: string, share: NoteShareState): Promise<void> {
  const collections = await getRxCollections()
  const metaDoc = await collections.notesMeta.findOne(id).exec()
  if (!metaDoc) return

  await metaDoc.incrementalPatch({
    sharePublished: share.published,
    shareId: share.shareId ?? undefined,
    sharePublishedAt: share.publishedAt ?? undefined,
    updatedAt: nowIso(),
  })

  await upsertSyncMeta(id, { isDirty: true, syncError: undefined })
}

export async function updateNoteTitle(id: string, title: string): Promise<void> {
  await updateNote(id, { title })
}

export async function applyBodyUpdate(id: string, body: string): Promise<void> {
  await updateNote(id, { body })
}

export async function archiveNote(id: string): Promise<void> {
  const collections = await getRxCollections()
  const metaDoc = await collections.notesMeta.findOne(id).exec()
  await metaDoc?.incrementalPatch({
    archived: true,
    updatedAt: nowIso(),
  })
  await upsertSyncMeta(id, { isDirty: true })
}

export async function deleteNote(id: string): Promise<void> {
  const collections = await getRxCollections()
  await removeNoteParts(id)
  const syncMetaDoc = await collections.syncMeta.findOne(id).exec()
  await syncMetaDoc?.remove()
  await collections.pendingDeletes.upsert({ noteId: id })
}

export async function getPendingDeletes(): Promise<string[]> {
  const collections = await getRxCollections()
  const rows = await collections.pendingDeletes.find().exec()
  return rows.map((row) => row.noteId)
}

export async function clearPendingDelete(noteId: string): Promise<void> {
  const collections = await getRxCollections()
  const row = await collections.pendingDeletes.findOne(noteId).exec()
  await row?.remove()
}

export async function listNotes(includeArchived = false): Promise<Note[]> {
  const collections = await getRxCollections()
  const [metaDocs, contentDocs] = await Promise.all([
    collections.notesMeta.find().exec(),
    collections.notesContent.find().exec(),
  ])

  const contentById = new Map(contentDocs.map((doc) => {
    const json = doc.toJSON()
    return [json.id, json]
  }))

  const notes = metaDocs
    .map((metaDoc) => {
      const meta = metaDoc.toJSON()
      const content = contentById.get(meta.id)
      return content ? hydrateNote(meta, content) : null
    })
    .filter((note): note is Note => note !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return includeArchived ? notes : notes.filter((note) => !note.archived)
}

export async function getNote(id: string): Promise<Note | undefined> {
  const { meta, content } = await getNoteParts(id)
  if (!meta || !content) return undefined
  return hydrateNote(meta, content)
}

export async function getNoteByShareId(shareId: string): Promise<Note | undefined> {
  const collections = await getRxCollections()
  const metaDoc = await collections.notesMeta.findOne({ selector: { shareId } }).exec()
  if (!metaDoc) return undefined
  const meta = metaDoc.toJSON()
  const contentDoc = await collections.notesContent.findOne(meta.id).exec()
  if (!contentDoc) return undefined
  return hydrateNote(meta, contentDoc.toJSON())
}

export async function getBodyText(noteId: string): Promise<string | undefined> {
  const note = await getNote(noteId)
  return note?.body
}

export async function getBodyCrdtState(noteId: string): Promise<string | undefined> {
  const { content } = await getNoteParts(noteId)
  return content?.crdtState
}

export async function getRemoteNotePayload(noteId: string): Promise<RemoteNote | undefined> {
  const { meta, content } = await getNoteParts(noteId)
  if (!meta || !content) return undefined
  return {
    ...hydrateNote(meta, content),
    crdtState: content.crdtState,
  }
}

export async function getSyncMeta(noteId: string): Promise<SyncMetadata | undefined> {
  const collections = await getRxCollections()
  return collections.syncMeta.findOne(noteId).exec().then((doc) => doc?.toJSON())
}

export async function markSynced(noteId: string): Promise<void> {
  await upsertSyncMeta(noteId, {
    isDirty: false,
    lastConfirmedSyncAt: nowIso(),
    syncError: undefined,
  })
}

export async function markSyncAttempted(noteId: string): Promise<void> {
  await upsertSyncMeta(noteId, {
    lastAttemptedSyncAt: nowIso(),
  })
}

export async function markSyncError(noteId: string, error: string): Promise<void> {
  await upsertSyncMeta(noteId, {
    syncError: error,
    lastAttemptedSyncAt: nowIso(),
  })
}

export async function setSetting(key: string, value: string): Promise<void> {
  const collections = await getRxCollections()
  await collections.settings.upsert({ key, value })
}

export async function getSetting(key: string): Promise<string | undefined> {
  const collections = await getRxCollections()
  return collections.settings.findOne(key).exec().then((doc) => doc?.value)
}

export async function getDirtyNotes(): Promise<Array<RemoteNote & { meta: SyncMetadata }>> {
  const collections = await getRxCollections()
  const syncMetaDocs = await collections.syncMeta.find().exec()
  const dirtyMeta = syncMetaDocs.map((doc) => doc.toJSON()).filter((meta) => meta.isDirty)
  const results = await Promise.all(
    dirtyMeta.map(async (meta) => {
      const note = await getRemoteNotePayload(meta.noteId)
      return note ? { ...note, meta } : null
    })
  )
  return results.filter((note): note is RemoteNote & { meta: SyncMetadata } => note !== null)
}

export async function applyRemoteNote(note: RemoteNote): Promise<void> {
  const [{ meta: localMeta, content: localContent }, localSyncMeta] = await Promise.all([
    getNoteParts(note.id),
    getSyncMeta(note.id),
  ])
  const remoteState = note.crdtState ?? createBodyState(note.body)
  const mergedState = localContent
    ? mergeBodyStates(localContent.crdtState, remoteState)
    : remoteState
  const mergedBody = getTextFromBodyState(mergedState)

  const mergedMeta = !localMeta || note.updatedAt >= localMeta.updatedAt
    ? {
        id: note.id,
        title: note.title,
        archived: note.archived,
        updatedAt: note.updatedAt,
        sharePublished: note.share?.published,
        shareId: note.share?.shareId ?? undefined,
        sharePublishedAt: note.share?.publishedAt ?? undefined,
      }
    : localMeta

  const mergedShare = mergedMeta.sharePublished || mergedMeta.shareId || mergedMeta.sharePublishedAt
    ? {
        published: mergedMeta.sharePublished ?? false,
        shareId: mergedMeta.shareId ?? null,
        publishedAt: mergedMeta.sharePublishedAt ?? null,
      }
    : undefined

  await upsertNoteParts({
    id: note.id,
    title: mergedMeta.title,
    body: mergedBody,
    archived: mergedMeta.archived,
    updatedAt: mergedMeta.updatedAt,
    share: mergedShare,
    crdtState: mergedState,
  })
  const shouldStayDirty = Boolean(
    localSyncMeta?.isDirty ||
    mergedState !== remoteState ||
    (localMeta && localMeta.updatedAt > note.updatedAt)
  )
  await upsertSyncMeta(note.id, {
    isDirty: shouldStayDirty ? true : false,
    lastConfirmedSyncAt: nowIso(),
    syncError: undefined,
  })
}

export async function applyRemoteTombstone(noteId: string): Promise<void> {
  const collections = await getRxCollections()
  await removeNoteParts(noteId)
  const [syncMetaDoc, pendingDeleteDoc] = await Promise.all([
    collections.syncMeta.findOne(noteId).exec(),
    collections.pendingDeletes.findOne(noteId).exec(),
  ])
  await Promise.all([
    syncMetaDoc?.remove(),
    pendingDeleteDoc?.remove(),
  ])
}

export async function observeNote(noteId: string): Promise<Observable<Note | null>> {
  const collections = await getRxCollections()
  return combineLatest([
    collections.notesMeta.findOne(noteId).$,
    collections.notesContent.findOne(noteId).$,
  ]).pipe(
    map(([metaDoc, contentDoc]) => {
      if (!metaDoc || !contentDoc) return null
      return hydrateNote(metaDoc.toJSON(), contentDoc.toJSON())
    })
  )
}

export async function observeSyncMeta(noteId: string): Promise<Observable<SyncMetadata | null>> {
  const collections = await getRxCollections()
  return collections.syncMeta.findOne(noteId).$.pipe(
    map((doc) => doc?.toJSON() ?? null)
  )
}

export async function observeVisibleNotes(): Promise<Observable<Note[]>> {
  const collections = await getRxCollections()
  return combineLatest([
    collections.notesMeta.find().$,
    collections.notesContent.find().$,
  ]).pipe(
    map(([metaDocs, contentDocs]) => {
      const contentById = new Map(contentDocs.map((doc) => {
        const json = doc.toJSON()
        return [json.id, json]
      }))

      return metaDocs
        .map((metaDoc) => {
          const meta = metaDoc.toJSON()
          const content = contentById.get(meta.id)
          return content ? hydrateNote(meta, content) : null
        })
        .filter((note): note is Note => note !== null && !note.archived)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    })
  )
}

export async function observeSetting(key: string): Promise<Observable<string | undefined>> {
  const collections = await getRxCollections()
  return collections.settings.findOne(key).$.pipe(
    map((doc) => doc?.value)
  )
}
