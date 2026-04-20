export interface Note {
  id: string
  title: string
  body: string
  archived?: boolean
  updatedAt: string
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
