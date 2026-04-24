import { useEffect, useState } from 'react'
import { rebuildIndex, saveSiteSettings } from '../lib/gardenService'
import { getGardenSettingsUrl, getPublicFeedUrl, getPublicIndexUrl, pullGardenSetting, pullIndex } from '../lib/remotestorage'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Input } from './ui/input'

interface Props {
  onSave?: (urlPrefix: string) => void
}

export function SettingsView({ onSave }: Props = {}) {
  const [title, setTitle] = useState('')
  const [tagline, setTagline] = useState('')
  const [urlPrefix, setUrlPrefix] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const publicIndexUrl = getPublicIndexUrl()
  const publicFeedUrl = getPublicFeedUrl()
  const gardenSettingsUrl = getGardenSettingsUrl()

  useEffect(() => {
    void Promise.all([
      pullGardenSetting('title'),
      pullGardenSetting('tagline'),
      pullIndex(),
    ]).then(([t, tl, index]) => {
      if (t) setTitle(t)
      if (tl) setTagline(tl)
      if (index?.urlPrefix) setUrlPrefix(index.urlPrefix)
    })
  }, [])

  async function handleSave(): Promise<void> {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await saveSiteSettings(title, tagline, urlPrefix)
      if (title) document.title = title
      onSave?.(urlPrefix)
      setMessage('Settings saved')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRebuild(): Promise<void> {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await rebuildIndex()
      setMessage('Index rebuilt')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Site Title</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My Garden" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Tagline</span>
          <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="A short description of your site" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">URL prefix</span>
          <Input value={urlPrefix} onChange={(e) => setUrlPrefix(e.target.value)} placeholder="yourname" />
          <span className="text-xs text-slate-500">Appears in public URLs: /p/<em>yourname</em>/…</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void handleSave()}>Save settings</Button>
          <Button disabled={busy} variant="outline" onClick={() => void handleRebuild()}>Rebuild index</Button>
        </div>
        {message ? <p className="text-sm text-green-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {publicIndexUrl || publicFeedUrl || gardenSettingsUrl ? (
          <div className="flex flex-wrap gap-4 border-t border-slate-200 pt-4 text-sm">
            {publicIndexUrl ? (
              <a className="underline underline-offset-4" href={publicIndexUrl} target="_blank" rel="noreferrer">Open index.json</a>
            ) : null}
            {publicFeedUrl ? (
              <a className="underline underline-offset-4" href={publicFeedUrl} target="_blank" rel="noreferrer">Open feed.json</a>
            ) : null}
            {gardenSettingsUrl ? (
              <a className="underline underline-offset-4" href={gardenSettingsUrl} target="_blank" rel="noreferrer">Open garden.json</a>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
