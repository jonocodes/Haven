import { useMemo, useState } from 'react'
import { useEffect } from 'react'
import { MarkdownEditor } from './MarkdownEditor'
import type { PublicNote } from '../lib/remotestorage'

interface Props {
  shareId: string
}

function getPublicSourceUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('src')
}

export function PublicNoteView({ shareId }: Props) {
  const [note, setNote] = useState<PublicNote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const srcUrl = useMemo(() => getPublicSourceUrl(), [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      if (!srcUrl) {
        setError('Missing source URL for shared note.')
        setLoading(false)
        return
      }

      try {
        const response = await fetch(srcUrl)
        if (!response.ok) {
          throw new Error(`Unable to load shared note (${response.status}).`)
        }
        const parsed = (await response.json()) as PublicNote

        if (!cancelled) {
          setNote(parsed)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load shared note.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [srcUrl])

  if (loading) {
    return <p className="max-w-3xl mx-auto p-6 text-gray-500">Loading shared note…</p>
  }

  if (error) {
    return <p className="max-w-3xl mx-auto p-6 text-red-600">{error}</p>
  }

  if (!note) {
    return <p className="max-w-3xl mx-auto p-6 text-gray-500">Shared note not found.</p>
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-4 border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-semibold text-gray-900">{note.title || 'Untitled note'}</h1>
        <p className="text-xs text-gray-500 mt-2">
          Shared note ID: <code>{shareId}</code> · Updated {new Date(note.updatedAt).toLocaleString()}
        </p>
      </div>

      <MarkdownEditor
        value={note.body}
        readOnly
      />
    </div>
  )
}
