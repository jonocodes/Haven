import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, updateNote, archiveNote, deleteNote } from '../lib/db'
import { schedulePush } from '../lib/sync'
import { SyncStatus } from './SyncStatus'

interface Props {
  noteId: string
}

export function NoteEditor({ noteId }: Props) {
  const navigate = useNavigate()
  const note = useLiveQuery(() => db.notes.get(noteId), [noteId])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  useEffect(() => {
    if (note) {
      setTitle(note.title)
      setBody(note.body)
    }
  }, [note?.id]) // only on initial load / id change

  const save = useCallback(
    async (newTitle: string, newBody: string) => {
      await updateNote(noteId, { title: newTitle, body: newBody })
      schedulePush(noteId)
    },
    [noteId]
  )

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value)
    save(e.target.value, body)
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value)
    save(title, e.target.value)
  }

  async function handleArchive() {
    await archiveNote(noteId)
    navigate({ to: '/' })
  }

  async function handleDelete() {
    if (!confirm('Delete this note permanently?')) return
    await deleteNote(noteId)
    navigate({ to: '/' })
  }

  if (note === undefined) return <p className="p-4 text-gray-400">Loading…</p>
  if (note === null) return <p className="p-4 text-gray-400">Note not found.</p>

  return (
    <div className="max-w-xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate({ to: '/' })}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Back
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
          <span>Last edited: {new Date(note.updatedAt).toLocaleString()}</span>
          <SyncStatus noteId={noteId} />
        </div>
      </div>

      <input
        type="text"
        value={title}
        onChange={handleTitleChange}
        placeholder="Title"
        className="w-full text-xl font-semibold border-0 focus:outline-none mb-3 text-gray-900 placeholder-gray-300"
      />

      <textarea
        value={body}
        onChange={handleBodyChange}
        placeholder="Write your note…"
        className="w-full min-h-[60vh] resize-none border-0 focus:outline-none text-gray-700 placeholder-gray-300 text-sm leading-relaxed"
      />

      <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
        <button
          onClick={handleArchive}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Archive
        </button>
        <button
          onClick={handleDelete}
          className="text-xs text-red-400 hover:text-red-600"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
