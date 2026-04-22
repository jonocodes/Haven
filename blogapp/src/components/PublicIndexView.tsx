import { useEffect, useMemo, useState } from 'react'
import { getPublicIndexUrl, getPublicMetaUrl, getPublicPostUrl } from '../lib/remotestorage'
import type { BlogIndex } from '../lib/types'

function getIndexUrlFromQuery(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('index')
}

export function PublicIndexView() {
  const [index, setIndex] = useState<BlogIndex | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const indexUrl = useMemo(() => getIndexUrlFromQuery() ?? getPublicIndexUrl(), [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(indexUrl)
        if (!response.ok) {
          throw new Error(`Unable to load blog index (${response.status}).`)
        }

        const parsed = (await response.json()) as BlogIndex
        if (!cancelled) {
          setIndex(parsed)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load blog index.')
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
    return <p className="mx-auto max-w-3xl p-6 text-slate-500">Loading blog index...</p>
  }

  if (error) {
    return <p className="mx-auto max-w-3xl p-6 text-red-600">{error}</p>
  }

  if (!index) {
    return <p className="mx-auto max-w-3xl p-6 text-slate-500">Blog index not found.</p>
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-3xl font-semibold text-slate-900">{index.title || 'My Blog'}</h1>
        <p className="mt-2 text-slate-600">Welcome! This is a placeholder intro text for your public blog home page.</p>
      </header>

      <ul className="space-y-4">
        {index.posts.map((post) => {
          const postUrl = new URL(window.location.origin)
          postUrl.pathname = `/p/${post.id}`
          postUrl.searchParams.set('src', getPublicPostUrl(post.id))
          postUrl.searchParams.set('meta', getPublicMetaUrl(post.id))
          postUrl.searchParams.set('index', indexUrl)

          return (
            <li key={post.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <a className="text-lg font-semibold text-slate-900 underline underline-offset-4" href={postUrl.toString()}>
                {post.title}
              </a>
              <p className="mt-1 text-sm text-slate-600">{post.excerpt}</p>
              <p className="mt-2 text-xs text-slate-500">Published {new Date(post.publishedAt).toLocaleString()}</p>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
