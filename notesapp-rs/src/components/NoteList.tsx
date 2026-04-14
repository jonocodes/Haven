import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from '@tanstack/react-router'
import { db, createNote } from '../lib/db'
import { SyncStatus } from './SyncStatus'

export function NoteList() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  const notes = useLiveQuery(
    () => db.notes.orderBy('updatedAt').reverse().filter((n) => !n.archived).toArray(),
    []
  )

  const filtered = notes && query.trim()
    ? notes.filter((n) => {
        const q = query.toLowerCase()
        return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
      })
    : notes

  async function handleNew() {
    const note = await createNote('Untitled', '')
    navigate({ to: '/notes/$id', params: { id: note.id } })
  }

  return (
    <div className="max-w-xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Notes</h1>
        <button
          onClick={handleNew}
          className="bg-blue-500 text-white px-4 py-1.5 rounded hover:bg-blue-600 text-sm"
        >
          New note
        </button>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search notes…"
        className="w-full mb-4 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 placeholder-gray-300"
      />

      {notes === undefined && <p className="text-gray-400 text-sm">Loading…</p>}

      {notes && notes.length === 0 && (
        <p className="text-gray-400 text-sm">No notes yet. Create one to get started.</p>
      )}

      {filtered && notes && notes.length > 0 && filtered.length === 0 && (
        <p className="text-gray-400 text-sm">No notes match "{query}".</p>
      )}

      <ul className="space-y-2">
        {filtered?.map((note) => (
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
