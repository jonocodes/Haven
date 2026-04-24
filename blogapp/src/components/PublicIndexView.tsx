import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../lib/navigate'
import { encodeIndexToken } from '../lib/indexToken'
import { getPublicIndexUrl } from '../lib/remotestorage'
import type { GardenIndex, GardenIndexEntry } from '../lib/types'

function getIndexUrlFromQuery(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('index')
}

interface Props {
  indexUrl?: string
  indexBasePath?: string
}

export function PublicIndexView({ indexUrl: propIndexUrl, indexBasePath }: Props = {}) {
  const [index, setIndex] = useState<GardenIndex | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const indexUrl = useMemo(() => propIndexUrl ?? getIndexUrlFromQuery() ?? getPublicIndexUrl(), [propIndexUrl])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!indexUrl) {
        setError('No public index URL available yet. Connect to remoteStorage first or provide ?index=.')
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(indexUrl)
        if (!response.ok) {
          throw new Error(`Unable to load garden index (${response.status}).`)
        }

        const parsed = (await response.json()) as GardenIndex
        if (!cancelled) {
          setIndex(parsed)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load garden index.')
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
  }, [indexUrl])

  if (loading) {
    return <p className="mx-auto max-w-3xl p-6 text-slate-500">Loading garden index...</p>
  }

  if (error) {
    return <p className="mx-auto max-w-3xl p-6 text-red-600">{error}</p>
  }

  if (!index) {
    return <p className="mx-auto max-w-3xl p-6 text-slate-500">Garden index not found.</p>
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-3xl font-semibold text-slate-900">{index.title || 'Loam'}</h1>
        {index.tagline ? <p className="mt-2 text-slate-600">{index.tagline}</p> : null}
      </header>

      <ul className="space-y-4">
        {index.posts.map((post) => {
          const postUrl = indexBasePath
            ? `${window.location.origin}${indexBasePath}/${post.id}`
            : indexUrl
              ? `${window.location.origin}/p/${encodeIndexToken(indexUrl)}/${post.id}`
              : `${window.location.origin}/public/${post.id}`

          return (
            <li key={post.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <a
                className="text-lg font-semibold text-slate-900 underline underline-offset-4"
                href={postUrl}
                onClick={(e) => { e.preventDefault(); navigate(postUrl, { entry: post } satisfies { entry: GardenIndexEntry }) }}
              >
                {post.title}
              </a>
              <p className="mt-1 text-sm text-slate-600">{post.excerpt}</p>
              <p className="mt-2 text-xs text-slate-500">Published {post.date || new Date(post.publishedAt).toLocaleDateString()}</p>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
