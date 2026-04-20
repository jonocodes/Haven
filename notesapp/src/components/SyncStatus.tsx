import { useSyncMeta } from '../lib/dbHooks'

interface Props {
  noteId: string
}

export function SyncStatus({ noteId }: Props) {
  const meta = useSyncMeta(noteId)

  if (!meta) return null

  let label: string
  let color: string

  if (meta.syncError) {
    label = 'Sync error'
    color = 'text-red-500'
  } else if (!meta.lastConfirmedSyncAt) {
    label = 'Not yet synced'
    color = 'text-gray-400'
  } else if (meta.isDirty) {
    label = 'Pending sync'
    color = 'text-yellow-500'
  } else {
    label = 'Synced'
    color = 'text-green-500'
  }

  return (
    <span className={`text-xs font-medium ${color}`} title={meta.syncError}>
      {label}
    </span>
  )
}
