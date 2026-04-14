import { type ChangeEvent, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from '@tanstack/react-router'
import { db, createNote } from '../lib/db'
import { SyncStatus } from './SyncStatus'
import { parseMarkdownToNote } from '../lib/importMarkdown'

export function NoteList() {
  const [query, setQuery] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const navigate = useNavigate()
  const importInputRef = useRef<HTMLInputElement>(null)

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

  async function handleImportFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    setImportError(null)

    try {
      let firstImportedId: string | null = null

      for (const file of Array.from(files)) {
        const content = await file.text()
        const parsed = parseMarkdownToNote(content, file.name)
        const note = await createNote(parsed.title, parsed.body)
        if (!firstImportedId) firstImportedId = note.id
      }

      if (firstImportedId) {
        navigate({ to: '/notes/$id', params: { id: firstImportedId } })
      }
    } catch (err) {
      setImportError(`Failed to import markdown file(s): ${String(err)}`)
    } finally {
      e.target.value = ''
    }
  }

  return (
    <div className="max-w-xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Notes</h1>
        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            multiple
            onChange={handleImportFiles}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-50 text-sm"
          >
            Upload .md
          </button>
          <button
            data-testid="new-note-btn"
            onClick={handleNew}
            className="bg-blue-500 text-white px-4 py-1.5 rounded hover:bg-blue-600 text-sm"
          >
            New note
          </button>
        </div>
      </div>

      {importError && (
        <p className="mb-3 text-xs text-red-600">{importError}</p>
      )}

      <input
        data-testid="search-input"
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

      <ul data-testid="note-list" className="space-y-2">
        {filtered?.map((note) => (
          <li key={note.id}>
            <Link
              data-testid="note-item"
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
