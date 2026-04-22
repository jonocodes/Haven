import { useEffect, useMemo, useState } from 'react'
import { MarkdownEditor } from './MarkdownEditor'
import { getPublicMetaUrl, getPublicPostUrl } from '../lib/remotestorage'
import type { BlogPostMeta } from '../lib/types'

interface Props {
  postId: string
}

function getQueryParam(name: string): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get(name)
}

export function PublicPostView({ postId }: Props) {
  const [body, setBody] = useState('')
  const [title, setTitle] = useState(postId)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const srcUrl = useMemo(() => getQueryParam('src') ?? getPublicPostUrl(postId), [postId])
  const metaUrl = useMemo(() => getQueryParam('meta') ?? getPublicMetaUrl(postId), [postId])
  const indexUrl = useMemo(() => getQueryParam('index'), [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const [metaRes, bodyRes] = await Promise.all([fetch(metaUrl), fetch(srcUrl)])

        if (!bodyRes.ok) {
          throw new Error(`Unable to load post body (${bodyRes.status})`)
        }

        const rawBody = await bodyRes.text()
        if (!cancelled) {
          setBody(rawBody)
        }

        if (metaRes.ok) {
          const parsedMeta = (await metaRes.json()) as BlogPostMeta
          if (!cancelled) {
            setTitle(parsedMeta.title || postId)
            setUpdatedAt(parsedMeta.updatedAt)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load public post')
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
  }, [metaUrl, postId, srcUrl])

  if (loading) {
    return <p className="mx-auto max-w-3xl p-6 text-slate-500">Loading public post...</p>
  }

  if (error) {
    return <p className="mx-auto max-w-3xl p-6 text-red-600">{error}</p>
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-4 border-b border-slate-200 pb-4">
        <div className="mb-2">
          <a
            className="text-sm text-slate-700 underline underline-offset-4"
            href={indexUrl ? `/public?index=${encodeURIComponent(indexUrl)}` : '/public'}
          >
            ← Back to home
          </a>
        </div>
        <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
        {updatedAt ? <p className="mt-2 text-xs text-slate-500">Updated {new Date(updatedAt).toLocaleString()}</p> : null}
      </header>
      <MarkdownEditor value={body} onChange={setBody} readOnly />
    </main>
  )
}
