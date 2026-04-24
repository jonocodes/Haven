import { useEffect, useMemo, useState } from 'react'
import { MarkdownEditor } from './MarkdownEditor'
import { navigate } from '../lib/navigate'
import { encodeIndexToken } from '../lib/indexToken'
import { getPublicIndexUrl } from '../lib/remotestorage'
import type { GardenIndexEntry } from '../lib/types'

interface Props {
  postId: string
  indexUrl?: string
  indexBasePath?: string
}

function getQueryParam(name: string): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get(name)
}

function getHistoryEntry(): GardenIndexEntry | null {
  const state = history.state as { entry?: GardenIndexEntry } | null
  return state?.entry ?? null
}

export function PublicPostView({ postId, indexUrl: propIndexUrl, indexBasePath }: Props) {
  const [body, setBody] = useState('')
  const [post, setPost] = useState<GardenIndexEntry | null>(getHistoryEntry)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const indexUrl = useMemo(() => propIndexUrl ?? getQueryParam('index') ?? getPublicIndexUrl(), [propIndexUrl])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        let entry = getHistoryEntry()

        if (!entry) {
          if (!indexUrl) {
            throw new Error('No public index URL available yet. Connect to remoteStorage first or provide ?index=.')
          }
          const indexRes = await fetch(indexUrl)
          if (!indexRes.ok) {
            throw new Error(`Unable to load garden index (${indexRes.status})`)
          }
          const index = (await indexRes.json()) as { posts?: GardenIndexEntry[] }
          entry = index.posts?.find((item) => item.id === postId) ?? null
          if (!entry) {
            throw new Error('Post not found in index.')
          }
        }

        const bodyRes = await fetch(entry.contentUrl)
        if (!bodyRes.ok) {
          throw new Error(`Unable to load post body (${bodyRes.status})`)
        }

        const rawBody = await bodyRes.text()
        if (!cancelled) {
          setPost(entry)
          setBody(rawBody)
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
  }, [indexUrl, postId])

  if (error) {
    return <p className="mx-auto max-w-3xl p-6 text-red-600">{error}</p>
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-4 border-b border-slate-200 pb-4">
        <div className="mb-2">
          <a
            className="text-sm text-slate-700 underline underline-offset-4"
            href={indexBasePath ?? (indexUrl ? `/p/${encodeIndexToken(indexUrl)}` : '/')}
            onClick={(e) => { e.preventDefault(); navigate(indexBasePath ?? (indexUrl ? `/p/${encodeIndexToken(indexUrl)}` : '/')) }}
          >
            ← Back to home
          </a>
        </div>
        <h1 className="text-3xl font-semibold text-slate-900">{post?.title ?? postId}</h1>
        {post?.updatedAt ? <p className="mt-2 text-xs text-slate-500">Updated {new Date(post.updatedAt).toLocaleString()}</p> : null}
      </header>
      {loading ? <p className="text-slate-500">Loading...</p> : <MarkdownEditor value={body} onChange={setBody} readOnly />}
    </main>
  )
}
