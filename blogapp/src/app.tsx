import { useEffect, useMemo, useState } from 'react'
import { ConnectWidget } from './components/ConnectWidget'
import { PublicPostView } from './components/PublicPostView'
import { Button } from './components/ui/button'
import { Card, CardContent, CardHeader } from './components/ui/card'
import { Input } from './components/ui/input'
import { MarkdownEditor } from './components/MarkdownEditor'
import { deletePost, generatePostId, publishPost, rebuildIndex, unpublishPost } from './lib/blogService'
import {
  getPublicIndexUrl,
  getPublicMetaUrl,
  getPublicPostUrl,
  isConnected,
  onConnected,
  onDisconnected,
  pullAllPostMeta,
  pullPostMarkdown,
  storePostMarkdown,
  storePostMeta,
} from './lib/remotestorage'
import { parseMarkdownToPost } from './lib/markdown'
import type { BlogPostMeta } from './lib/types'

function sortByUpdatedDescending(items: BlogPostMeta[]): BlogPostMeta[] {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function App() {
  const [connected, setConnected] = useState(isConnected())
  const [items, setItems] = useState<BlogPostMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [id, setId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<BlogPostMeta['status']>('draft')

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function refreshList(): Promise<void> {
    const all = await pullAllPostMeta()
    setItems(sortByUpdatedDescending(all))
  }

  useEffect(() => {
    const connectedHandler = () => setConnected(true)
    const disconnectedHandler = () => setConnected(false)
    onConnected(connectedHandler)
    onDisconnected(disconnectedHandler)

    void refreshList().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err))
    })
  }, [])

  useEffect(() => {
    if (!selectedId) return

    const selected = items.find((item) => item.id === selectedId)
    if (!selected) return

    setId(selected.id)
    setTitle(selected.title)
    setExcerpt(selected.excerpt)
    setStatus(selected.status)
    setMessage('')
    setError('')

    void pullPostMarkdown(selected.id)
      .then((content) => setBody(content ?? ''))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [selectedId, items])

  function clearEditor(): void {
    setSelectedId(null)
    setId(null)
    setTitle('')
    setExcerpt('')
    setBody('')
    setStatus('draft')
    setError('')
    setMessage('')
  }

  const selectedMeta = useMemo(() => items.find((item) => item.id === id) ?? null, [items, id])
  const publicIndexUrl = getPublicIndexUrl()
  const publicPostUrl = id ? getPublicPostUrl(id) : null

  const publicPostPageUrl = id
    ? (() => {
        const url = new URL(window.location.href)
        url.pathname = `/p/${id}`
        url.search = ''
        url.searchParams.set('src', getPublicPostUrl(id))
        url.searchParams.set('meta', getPublicMetaUrl(id))
        return url.toString()
      })()
    : null

  if (window.location.pathname.startsWith('/p/')) {
    const postIdFromPath = window.location.pathname.split('/').filter(Boolean)[1]
    if (!postIdFromPath) {
      return <p className="mx-auto max-w-3xl p-6 text-red-600">Missing post id in URL.</p>
    }
    return <PublicPostView postId={postIdFromPath} />
  }


  async function saveDraft(): Promise<void> {
    setBusy(true)
    setError('')
    setMessage('')

    try {
      const now = new Date().toISOString()
      const parsed = parseMarkdownToPost(body)
      const resolvedTitle = title.trim() || parsed.title || 'Untitled'
      const resolvedExcerpt = excerpt.trim() || parsed.excerpt
      const parsedBody = parsed.body

      const postId = id ?? (await generatePostId(resolvedTitle || 'untitled'))
      const createdAt = selectedMeta?.createdAt ?? now
      const nextStatus = selectedMeta?.status ?? 'draft'
      const nextPublishedAt = selectedMeta?.publishedAt ?? null
      const nextDeletedAt = selectedMeta?.deletedAt ?? null

      const meta: BlogPostMeta = {
        version: 1,
        id: postId,
        title: resolvedTitle,
        excerpt: resolvedExcerpt,
        status: nextStatus,
        createdAt,
        updatedAt: now,
        publishedAt: nextPublishedAt,
        deletedAt: nextDeletedAt,
      }

      await storePostMeta(meta)
      await storePostMarkdown(postId, parsedBody)

      setId(postId)
      setTitle(meta.title)
      setExcerpt(meta.excerpt)
      setBody(parsedBody)
      setStatus(meta.status)
      await refreshList()
      setMessage('Draft saved')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function runAction(action: 'publish' | 'unpublish' | 'delete' | 'rebuild'): Promise<void> {
    setBusy(true)
    setError('')
    setMessage('')

    try {
      if (action === 'rebuild') {
        await rebuildIndex()
        setMessage('Index rebuilt')
      } else {
        if (!id) {
          throw new Error('Select or save a post first')
        }

        if (action === 'publish') {
          await publishPost(id)
          setMessage('Post published')
          setStatus('published')
        } else if (action === 'unpublish') {
          await unpublishPost(id)
          setMessage('Post unpublished')
          setStatus('unpublished')
        } else if (action === 'delete') {
          const confirmed = window.confirm('Delete this post markdown and metadata?')
          if (!confirmed) return
          await deletePost(id)
          setMessage('Post deleted')
          clearEditor()
        }
      }

      await refreshList()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6 font-sans text-slate-900">
      <ConnectWidget />

      <header className="mb-6 space-y-2">
        <h1 className="text-3xl font-semibold">Blog App (remoteStorage)</h1>
        <p>
          Connection status: <strong>{connected ? 'Connected' : 'Not connected'}</strong>. Use the remoteStorage widget in the
          page corner to connect.
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <a className="underline underline-offset-4" href={publicIndexUrl} target="_blank" rel="noreferrer">Open public index.json</a>
          {publicPostPageUrl ? (
            <a className="underline underline-offset-4" href={publicPostPageUrl} target="_blank" rel="noreferrer">
              Open public post page
            </a>
          ) : null}
          {publicPostUrl ? (
            <a className="underline underline-offset-4" href={publicPostUrl} target="_blank" rel="noreferrer">
              Open raw markdown
            </a>
          ) : null}
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <strong>Posts</strong>
            <Button variant="outline" size="sm" onClick={clearEditor}>New</Button>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? <p className="text-sm text-slate-500">No posts yet.</p> : null}
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <Button variant="secondary" className="h-auto w-full justify-start p-3 text-left" onClick={() => setSelectedId(item.id)}>
                    <div>
                      <div className="font-semibold">{item.title}</div>
                      <div className="text-xs text-slate-500">{item.status} · {item.id}</div>
                    </div>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-4">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Title</span>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-medium">Excerpt</span>
              <Input value={excerpt} onChange={(event) => setExcerpt(event.target.value)} />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-medium">Markdown Body</span>
              <MarkdownEditor value={body} onChange={setBody} />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void saveDraft()}>Save draft</Button>
              <Button disabled={busy} variant="secondary" onClick={() => void runAction('publish')}>Publish</Button>
              <Button disabled={busy} variant="secondary" onClick={() => void runAction('unpublish')}>Unpublish</Button>
              <Button disabled={busy} variant="destructive" onClick={() => void runAction('delete')}>Delete</Button>
              <Button disabled={busy} variant="outline" onClick={() => void runAction('rebuild')}>Rebuild index</Button>
              <span className="ml-auto text-xs text-slate-500">Status: {status}</span>
            </div>

            {message ? <p className="text-sm text-green-700">{message}</p> : null}
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
