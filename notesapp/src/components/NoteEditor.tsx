import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { updateNoteTitle, applyBodyUpdate, archiveNote, deleteNote, updateNoteShare } from '../lib/db'
import { useNote, useSetting, useSyncMeta } from '../lib/dbHooks'
import { schedulePush, pushDirtyNotes } from '../lib/sync'
import { getPublicNoteUrl, publishNote, unpublishNoteByShareId } from '../lib/remotestorage'
import { SyncStatus } from './SyncStatus'
import { MarkdownEditor } from './MarkdownEditor'
import { computeInsertedWordHighlights, type TextRange } from '../lib/diffHighlights'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import type { RemoteNote } from '../lib/notes'

interface Props {
  noteId: string
}

export function NoteEditor({ noteId }: Props) {
  const navigate = useNavigate()
  const note = useNote(noteId)
  const meta = useSyncMeta(noteId)
  const highlightIncomingSetting = useSetting('highlightIncomingChanges')
  const highlightIncomingEnabled = highlightIncomingSetting !== 'false'
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [incomingHighlights, setIncomingHighlights] = useState<TextRange[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [bodySyncRevision, setBodySyncRevision] = useState(0)
  const [publishBusy, setPublishBusy] = useState(false)
  const currentBodyRef = useRef('')
  const lastLocalBodyRef = useRef<string | null>(null)
  const pendingBodySaveRef = useRef<string | null>(null)
  const bodySaveInFlightRef = useRef(false)

  // Initial load
  useEffect(() => {
    if (note) {
      setTitle(note.title)
      setBody(note.body)
      currentBodyRef.current = note.body
      setHasLoaded(true)
    }
  }, [note?.id])

  // Apply remote changes — only when not dirty (safe to overwrite local state)
  useEffect(() => {
    if (note && meta && !meta.isDirty && hasLoaded) {
      const previousBody = currentBodyRef.current
      const pendingLocalBody = lastLocalBodyRef.current
      const isLocalBodyEcho = pendingLocalBody !== null && note.body === pendingLocalBody

      if (pendingLocalBody !== null && !isLocalBodyEcho) {
        setTitle(note.title)
        return
      }

      const isRemoteBodyChange = note.body !== previousBody && note.body !== lastLocalBodyRef.current

      if (isRemoteBodyChange) {
        if (highlightIncomingEnabled) {
          setIncomingHighlights(computeInsertedWordHighlights(previousBody, note.body))
        } else {
          setIncomingHighlights([])
        }
        setBodySyncRevision((rev) => rev + 1)
      } else {
        setIncomingHighlights([])
      }

      if (note.body === lastLocalBodyRef.current) {
        lastLocalBodyRef.current = null
      }

      if (pendingBodySaveRef.current === note.body) {
        pendingBodySaveRef.current = null
      }

      setTitle(note.title)
      setBody(note.body)
      currentBodyRef.current = note.body
    }
  }, [note?.updatedAt, note?.title, note?.body, meta?.isDirty, hasLoaded, highlightIncomingEnabled])

  const saveTitle = useCallback(
    async (newTitle: string) => {
      await updateNoteTitle(noteId, newTitle)
      schedulePush(noteId)
    },
    [noteId]
  )

  const flushBodySave = useCallback(async () => {
    if (bodySaveInFlightRef.current) return
    bodySaveInFlightRef.current = true

    try {
      while (pendingBodySaveRef.current !== null) {
        const bodyToSave = pendingBodySaveRef.current
        pendingBodySaveRef.current = null
        lastLocalBodyRef.current = bodyToSave
        await applyBodyUpdate(noteId, bodyToSave)
        schedulePush(noteId)
      }
    } finally {
      bodySaveInFlightRef.current = false
    }
  }, [noteId])

  const saveBody = useCallback(
    (newBody: string) => {
      pendingBodySaveRef.current = newBody
      void flushBodySave()
    },
    [flushBodySave]
  )

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value)
    saveTitle(e.target.value)
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

  async function handlePublishToggle() {
    if (!note || publishBusy) return
    setPublishBusy(true)
    try {
      if (note.share?.published && note.share.shareId) {
        await unpublishNoteByShareId(note.share.shareId)
        await updateNoteShare(noteId, {
          published: false,
          shareId: null,
          publishedAt: null,
        })
        schedulePush(noteId)
        return
      }

      const { shareId } = await publishNote(note as RemoteNote)
      await updateNoteShare(noteId, {
        published: true,
        shareId,
        publishedAt: note.share?.publishedAt ?? new Date().toISOString(),
      })
      schedulePush(noteId)
    } finally {
      setPublishBusy(false)
    }
  }

  async function handleCopyPublicLink() {
    const shareId = note?.share?.shareId
    if (!shareId) return
    await navigator.clipboard.writeText(getPublicNoteUrl(shareId))
  }

  if (note === undefined) return <p className="p-4 text-gray-400">Loading…</p>
  if (note === null) return <p className="p-4 text-gray-400">Note not found.</p>

  return (
    <div className="max-w-xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-4">
        <Button
          data-testid="back-btn"
          onClick={() => navigate({ to: '/' })}
          variant="link"
        >
          ← Back
        </Button>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
          <span>Last edited: {new Date(note.updatedAt).toLocaleString()}</span>
          <SyncStatus noteId={noteId} />
        </div>
      </div>

      <Input
        data-testid="note-title"
        type="text"
        value={title}
        onChange={handleTitleChange}
        placeholder="Title"
        variant="title"
        className="w-full mb-3"
      />

      <div data-testid="note-body">
        <MarkdownEditor
          value={body}
          syncRevision={bodySyncRevision}
          incomingHighlightRanges={incomingHighlights}
          onChange={(val) => {
            setBody(val)
            currentBodyRef.current = val
            saveBody(val)
          }}
        />
      </div>

      <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
        <Button
          onClick={handlePublishToggle}
          variant="ghost"
          className="text-xs p-0"
          disabled={publishBusy}
        >
          {note.share?.published ? 'Unpublish' : 'Publish'}
        </Button>
        <Button
          onClick={handleCopyPublicLink}
          variant="ghost"
          className="text-xs p-0"
          disabled={!note.share?.published || !note.share?.shareId}
        >
          Copy public link
        </Button>
        {note.share?.published && (
          <span className="text-xs text-gray-400 self-center">
            Public updates follow note edits automatically.
          </span>
        )}
        <Button
          data-testid="archive-btn"
          onClick={handleArchive}
          variant="ghost"
          className="text-xs p-0 ml-auto"
        >
          Archive
        </Button>
        <Button
          data-testid="delete-btn"
          onClick={handleDelete}
          variant="destructive"
          className="text-xs p-0"
        >
          Delete
        </Button>
        <Button
          onClick={handleDownload}
          variant="ghost"
          className="text-xs p-0"
        >
          Download .md
        </Button>
      </div>
    </div>
  )
}
