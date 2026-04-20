export interface Note {
  id: string
  title: string
  body: string
  archived?: boolean
  updatedAt: string
  share?: NoteShareState
}

export interface NoteShareState {
  published: boolean
  shareId: string | null
  publishedAt: string | null
}

export interface RemoteNote extends Note {
  crdtState?: string
}

export interface SyncMetadata {
  noteId: string
  isDirty: boolean
  lastAttemptedSyncAt?: string
  lastConfirmedSyncAt?: string
  syncError?: string
}
