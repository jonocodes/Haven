import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, updateNote, archiveNote, deleteNote } from '../lib/db'
import { schedulePush, pushDirtyNotes } from '../lib/sync'
import { SyncStatus } from './SyncStatus'
import { MarkdownEditor } from './MarkdownEditor'

interface Props {
  noteId: string
}

export function NoteEditor({ noteId }: Props) {
  const navigate = useNavigate()
  const note = useLiveQuery(() => db.notes.get(noteId), [noteId])
  const meta = useLiveQuery(() => db.syncMeta.get(noteId), [noteId])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  // Initial load
  useEffect(() => {
    if (note) {
      setTitle(note.title)
      setBody(note.body)
    }
  }, [note?.id])

  // Apply remote changes — only when not dirty (safe to overwrite local state)
  useEffect(() => {
    if (note && meta && !meta.isDirty) {
      setTitle(note.title)
      setBody(note.body)
    }
  }, [note?.updatedAt])

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
    pushDirtyNotes()
    navigate({ to: '/' })
  }

  async function handleDelete() {
    if (!confirm('Delete this note permanently?')) return
    await deleteNote(noteId)
    pushDirtyNotes()
    navigate({ to: '/' })
  }

  function handleDownload() {
    const filename = (title.trim() || 'untitled').replace(/[^a-z0-9_\- ]/gi, '_') + '.md'
    const content = title ? `# ${title}\n\n${body}` : body
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
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

      <MarkdownEditor value={body} onChange={(val) => { setBody(val); save(title, val) }} />

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
        <button
          onClick={handleDownload}
          className="text-xs text-gray-400 hover:text-gray-600 ml-auto"
        >
          Download .md
        </button>
      </div>
    </div>
  )
}
