import { useEffect, useMemo, useState } from 'react'
import { ConnectWidget } from './components/ConnectWidget'
import { deletePost, generatePostId, publishPost, rebuildIndex, unpublishPost } from './lib/blogService'
import {
  getPublicIndexUrl,
  getPublicPostUrl,
  isConnected,
  onConnected,
  onDisconnected,
  pullAllPostMeta,
  pullPostMarkdown,
  storePostMarkdown,
  storePostMeta,
} from './lib/remotestorage'
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

  async function saveDraft(): Promise<void> {
    setBusy(true)
    setError('')
    setMessage('')

    try {
      const now = new Date().toISOString()
      const postId = id ?? (await generatePostId(title || 'untitled'))
      const createdAt = selectedMeta?.createdAt ?? now
      const nextStatus = selectedMeta?.status ?? 'draft'
      const nextPublishedAt = selectedMeta?.publishedAt ?? null
      const nextDeletedAt = selectedMeta?.deletedAt ?? null

      const meta: BlogPostMeta = {
        version: 1,
        id: postId,
        title: title || 'Untitled',
        excerpt,
        status: nextStatus,
        createdAt,
        updatedAt: now,
        publishedAt: nextPublishedAt,
        deletedAt: nextDeletedAt,
      }

      await storePostMeta(meta)
      await storePostMarkdown(postId, body)

      setId(postId)
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
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem auto', maxWidth: 1100, lineHeight: 1.4 }}>
      <ConnectWidget />
      <h1>Blog App (remoteStorage)</h1>
      <p style={{ marginBottom: 16 }}>
        Connection status: <strong>{connected ? 'Connected' : 'Not connected'}</strong>. Use the remoteStorage widget in the
        page corner to connect.
      </p>

      <section style={{ marginBottom: 16, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <a href={publicIndexUrl} target="_blank" rel="noreferrer">Open public index.json</a>
        {publicPostUrl ? <a href={publicPostUrl} target="_blank" rel="noreferrer">Open current post markdown</a> : null}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
        <aside style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>Posts</strong>
            <button type="button" onClick={clearEditor}>New</button>
          </div>

          {items.length === 0 ? <p>No posts yet.</p> : null}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map((item) => (
              <li key={item.id} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  style={{ width: '100%', textAlign: 'left', padding: 8 }}
                >
                  <div style={{ fontWeight: 600 }}>{item.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{item.status} · {item.id}</div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>
              <div>Title</div>
              <input value={title} onChange={(event) => setTitle(event.target.value)} style={{ width: '100%', padding: 8 }} />
            </label>

            <label>
              <div>Excerpt</div>
              <input value={excerpt} onChange={(event) => setExcerpt(event.target.value)} style={{ width: '100%', padding: 8 }} />
            </label>

            <label>
              <div>Markdown Body</div>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={18}
                style={{ width: '100%', padding: 8, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" disabled={busy} onClick={() => void saveDraft()}>Save draft</button>
            <button type="button" disabled={busy} onClick={() => void runAction('publish')}>Publish</button>
            <button type="button" disabled={busy} onClick={() => void runAction('unpublish')}>Unpublish</button>
            <button type="button" disabled={busy} onClick={() => void runAction('delete')}>Delete</button>
            <button type="button" disabled={busy} onClick={() => void runAction('rebuild')}>Rebuild index</button>
            <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.8 }}>Status: {status}</span>
          </div>

          {message ? <p style={{ color: 'green' }}>{message}</p> : null}
          {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
        </section>
      </section>
    </main>
  )
}
