import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from '@tanstack/react-router'
import { db, createNote } from '../lib/db'
import { SyncStatus } from './SyncStatus'

export function NoteList() {
  const notes = useLiveQuery(
    () => db.notes.orderBy('updatedAt').reverse().filter((n) => !n.archived).toArray(),
    []
  )

  async function handleNew() {
    const note = await createNote('Untitled', '')
    window.location.href = `/notes/${note.id}`
  }

  return (
    <div className="max-w-xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Notes</h1>
        <button
          onClick={handleNew}
          className="bg-blue-500 text-white px-4 py-1.5 rounded hover:bg-blue-600 text-sm"
        >
          New note
        </button>
      </div>

      {notes === undefined && <p className="text-gray-400 text-sm">Loading…</p>}

      {notes && notes.length === 0 && (
        <p className="text-gray-400 text-sm">No notes yet. Create one to get started.</p>
      )}

      <ul className="space-y-2">
        {notes?.map((note) => (
          <li key={note.id}>
            <Link
              to="/notes/$id"
              params={{ id: note.id }}
              className="block border border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex justify-between items-start gap-2">
                <span className="font-medium text-gray-800 truncate">
                  {note.title || 'Untitled'}
                </span>
                <SyncStatus noteId={note.id} />
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {new Date(note.updatedAt).toLocaleString()}
              </div>
              {note.body && (
                <div className="text-sm text-gray-500 mt-1 truncate">{note.body}</div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
