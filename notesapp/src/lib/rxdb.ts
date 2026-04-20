import { createRxDatabase, type RxCollection, type RxDatabase, type RxJsonSchema } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'

export interface NoteMetaDoc {
  id: string
  title: string
  archived?: boolean
  updatedAt: string
  sharePublished?: boolean
  shareId?: string
  sharePublishedAt?: string
}

export interface NoteContentDoc {
  id: string
  plainText: string
  crdtState: string
  updatedAt: string
}

export interface SyncMetaDoc {
  noteId: string
  isDirty: boolean
  lastAttemptedSyncAt?: string
  lastConfirmedSyncAt?: string
  syncError?: string
}

export interface SettingDoc {
  key: string
  value: string
}

export interface PendingDeleteDoc {
  noteId: string
}

export interface NotesRxCollections {
  notesMeta: RxCollection<NoteMetaDoc>
  notesContent: RxCollection<NoteContentDoc>
  syncMeta: RxCollection<SyncMetaDoc>
  settings: RxCollection<SettingDoc>
  pendingDeletes: RxCollection<PendingDeleteDoc>
}

export type NotesRxDatabase = RxDatabase<NotesRxCollections>

const noteMetaSchema: RxJsonSchema<NoteMetaDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100,
    },
    title: {
      type: 'string',
      maxLength: 10_000,
    },
    archived: {
      type: 'boolean',
    },
    updatedAt: {
      type: 'string',
      maxLength: 40,
    },
    sharePublished: {
      type: 'boolean',
    },
    shareId: {
      type: 'string',
      maxLength: 200,
    },
    sharePublishedAt: {
      type: 'string',
      maxLength: 40,
    },
  },
  required: ['id', 'title', 'updatedAt'],
  indexes: ['updatedAt'],
  additionalProperties: false,
}

const noteContentSchema: RxJsonSchema<NoteContentDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100,
    },
    plainText: {
      type: 'string',
      maxLength: 5_000_000,
    },
    crdtState: {
      type: 'string',
      maxLength: 5_000_000,
    },
    updatedAt: {
      type: 'string',
      maxLength: 40,
    },
  },
  required: ['id', 'plainText', 'crdtState', 'updatedAt'],
  indexes: ['updatedAt'],
  additionalProperties: false,
}

const syncMetaSchema: RxJsonSchema<SyncMetaDoc> = {
  version: 0,
  primaryKey: 'noteId',
  type: 'object',
  properties: {
    noteId: {
      type: 'string',
      maxLength: 100,
    },
    isDirty: {
      type: 'boolean',
    },
    lastAttemptedSyncAt: {
      type: 'string',
      maxLength: 40,
    },
    lastConfirmedSyncAt: {
      type: 'string',
      maxLength: 40,
    },
    syncError: {
      type: 'string',
      maxLength: 20_000,
    },
  },
  required: ['noteId', 'isDirty'],
  indexes: ['isDirty'],
  additionalProperties: false,
}

const settingSchema: RxJsonSchema<SettingDoc> = {
  version: 0,
  primaryKey: 'key',
  type: 'object',
  properties: {
    key: {
      type: 'string',
      maxLength: 200,
    },
    value: {
      type: 'string',
      maxLength: 50_000,
    },
  },
  required: ['key', 'value'],
  additionalProperties: false,
}

const pendingDeleteSchema: RxJsonSchema<PendingDeleteDoc> = {
  version: 0,
  primaryKey: 'noteId',
  type: 'object',
  properties: {
    noteId: {
      type: 'string',
      maxLength: 100,
    },
  },
  required: ['noteId'],
  additionalProperties: false,
}

let dbPromise: Promise<NotesRxDatabase> | null = null

export async function getRxDb(): Promise<NotesRxDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await createRxDatabase<NotesRxCollections>({
        name: 'notesapp-rxdb',
        storage: getRxStorageDexie(),
        multiInstance: false,
      })

      await db.addCollections({
        notesMeta: { schema: noteMetaSchema },
        notesContent: { schema: noteContentSchema },
        syncMeta: { schema: syncMetaSchema },
        settings: { schema: settingSchema },
        pendingDeletes: { schema: pendingDeleteSchema },
      })

      return db
    })()
  }

  return dbPromise
}

export async function getRxCollections(): Promise<NotesRxCollections> {
  const db = await getRxDb()
  return {
    notesMeta: db.notesMeta,
    notesContent: db.notesContent,
    syncMeta: db.syncMeta,
    settings: db.settings,
    pendingDeletes: db.pendingDeletes,
  }
}

export async function resetRxDbForTests(): Promise<void> {
  if (!dbPromise) return
  const db = await dbPromise
  await db.remove()
  dbPromise = null
}
