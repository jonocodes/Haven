import { createFileRoute, Link } from '@tanstack/react-router'
import { FormEvent, useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { getSetting, setSetting } from '../lib/db'

const DEFAULT_PULL_SECONDS = 5
const MIN_PULL_SECONDS = 1
const MAX_PULL_SECONDS = 300
const DEFAULT_NTFY_SERVER = 'https://ntfy.sh'

function clampPullSeconds(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PULL_SECONDS
  return Math.max(MIN_PULL_SECONDS, Math.min(MAX_PULL_SECONDS, Math.round(value)))
}

function parseBooleanSetting(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback
  return value === 'true'
}

function PreferencesPage() {
  const [pullSeconds, setPullSeconds] = useState(String(DEFAULT_PULL_SECONDS))
  const [ntfyEnabled, setNtfyEnabled] = useState(false)
  const [ntfyServerUrl, setNtfyServerUrl] = useState(DEFAULT_NTFY_SERVER)
  const [ntfyTopic, setNtfyTopic] = useState('')
  const [highlightIncomingChanges, setHighlightIncomingChanges] = useState(true)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    let cancelled = false

    async function loadPrefs() {
      const [
        savedPullSeconds,
        savedNtfyEnabled,
        savedNtfyServer,
        savedNtfyTopic,
        savedHighlightIncomingChanges,
      ] = await Promise.all([
        getSetting('pullIntervalSeconds'),
        getSetting('ntfyEnabled'),
        getSetting('ntfyServerUrl'),
        getSetting('ntfyTopic'),
        getSetting('highlightIncomingChanges'),
      ])

      if (cancelled) return

      setPullSeconds(String(clampPullSeconds(Number(savedPullSeconds ?? DEFAULT_PULL_SECONDS))))
      setNtfyEnabled(parseBooleanSetting(savedNtfyEnabled, false))
      setNtfyServerUrl(savedNtfyServer?.trim() || DEFAULT_NTFY_SERVER)
      setNtfyTopic(savedNtfyTopic ?? '')
      setHighlightIncomingChanges(parseBooleanSetting(savedHighlightIncomingChanges, true))
    }

    void loadPrefs()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('saving')

    try {
      const normalizedPullSeconds = clampPullSeconds(Number(pullSeconds))
      await Promise.all([
        setSetting('pullIntervalSeconds', String(normalizedPullSeconds)),
        setSetting('ntfyEnabled', String(ntfyEnabled)),
        setSetting('ntfyServerUrl', ntfyServerUrl.trim() || DEFAULT_NTFY_SERVER),
        setSetting('ntfyTopic', ntfyTopic.trim()),
        setSetting('highlightIncomingChanges', String(highlightIncomingChanges)),
      ])
      setPullSeconds(String(normalizedPullSeconds))
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="max-w-xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/" className="text-sm text-gray-400 hover:text-gray-600">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold">Preferences</h1>
      </div>

      <form className="space-y-5" onSubmit={handleSave}>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Pull frequency (seconds)</span>
          <Input
            type="number"
            min={MIN_PULL_SECONDS}
            max={MAX_PULL_SECONDS}
            step={1}
            value={pullSeconds}
            onChange={(e) => setPullSeconds(e.target.value)}
            className="mt-2 w-48"
          />
          <p className="mt-1 text-xs text-gray-500">Controls periodic remoteStorage pull cadence (1-300s).</p>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Enable ntfy invalidation</span>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={ntfyEnabled}
              onChange={(e) => setNtfyEnabled(e.target.checked)}
            />
            <span className="text-sm text-gray-600">Enable ntfy publish/subscribe wake-up behavior.</span>
          </div>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">ntfy server URL</span>
          <Input
            type="url"
            placeholder="https://ntfy.sh"
            value={ntfyServerUrl}
            onChange={(e) => setNtfyServerUrl(e.target.value)}
            className="mt-2 w-full"
            disabled={!ntfyEnabled}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">ntfy topic</span>
          <Input
            type="text"
            placeholder="haven-notes-v1-..."
            value={ntfyTopic}
            onChange={(e) => setNtfyTopic(e.target.value)}
            className="mt-2 w-full"
            disabled={!ntfyEnabled}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Highlight incoming remote changes</span>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={highlightIncomingChanges}
              onChange={(e) => setHighlightIncomingChanges(e.target.checked)}
            />
            <span className="text-sm text-gray-600">Show transient highlights when remote body updates arrive.</span>
          </div>
        </label>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="default" size="sm">Save preferences</Button>
          {status === 'saving' && <span className="text-xs text-gray-500">Saving…</span>}
          {status === 'saved' && <span className="text-xs text-green-600">Saved</span>}
          {status === 'error' && <span className="text-xs text-red-600">Failed to save preferences</span>}
        </div>
      </form>
    </div>
  )
}

export const Route = createFileRoute('/preferences')({ component: PreferencesPage })
