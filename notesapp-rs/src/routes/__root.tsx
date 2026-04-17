import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ConnectWidget } from '../components/ConnectButton'
import { onNtfyPublishCountChange, onNtfyReceiveCountChange } from '../lib/notify'
import { rs, onConnected, onDisconnected, onRemoteChange, pullAndApplySyncedSettings } from '../lib/remotestorage'
import { startNtfyListener, startSyncLoop, stopNtfyListener, stopSyncLoop, pullAndMerge, pushDirtyNotes } from '../lib/sync'
import { useSetting } from '../lib/dbHooks'

function formatRelativeTime(isoString: string | undefined): string {
  if (!isoString) return '—'
  const diff = Date.now() - new Date(isoString).getTime()
  if (diff < 0) return 'just now'
  if (diff < 1_000) return 'just now'
  if (diff < 60_000) return `${Math.floor(diff / 1_000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
}

function parsePullIntervalSeconds(value: string | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 5
  return Math.max(1, Math.min(300, Math.round(parsed)))
}

function DebugDrawer({
  connected,
  pullSeconds,
  ntfyEnabled,
  ntfyPushCount,
  ntfyReceiveCount,
}: {
  connected: boolean
  pullSeconds: number
  ntfyEnabled: boolean
  ntfyPushCount: number
  ntfyReceiveCount: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [tick, setTick] = useState(0)
  const lastPushAt = useSetting('lastPushAt')
  const lastPullAt = useSetting('lastPullAt')

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="fixed bottom-0 left-0 z-50">
      <div className="flex flex-col items-start">
        {expanded && connected && (
          <div className="bg-gray-900 text-gray-200 text-xs font-mono rounded-tr-lg p-3 mb-1 min-w-[200px]">
            <div className="text-gray-400 mb-2">debug</div>
            <div className="space-y-1">
              <div>↑ push <span className="text-green-400">{formatRelativeTime(lastPushAt)}</span></div>
              <div>↓ pull <span className="text-blue-400">{formatRelativeTime(lastPullAt)}</span></div>
              <div>pull every {pullSeconds}s</div>
              <div>ntfy {ntfyEnabled ? <span className="text-green-400">on</span> : <span className="text-gray-500">off</span>}</div>
              <div>↑↑ {ntfyPushCount} sent</div>
              <div>↓↓ {ntfyReceiveCount} received</div>
            </div>
          </div>
        )}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-tr-lg rounded-bl-lg transition-colors"
        >
          {expanded ? 'debug ▲' : 'debug ▼'}
        </button>
      </div>
    </div>
  )
}

function RootLayout() {
  const [connected, setConnected] = useState(rs.connected)
  const [ntfyPushCount, setNtfyPushCount] = useState(0)
  const [ntfyReceiveCount, setNtfyReceiveCount] = useState(0)
  const pullIntervalSetting = useSetting('pullIntervalSeconds')
  const ntfyEnabledSetting = useSetting('ntfyEnabled')
  const pullSeconds = parsePullIntervalSeconds(pullIntervalSetting)
  const ntfyEnabled = ntfyEnabledSetting === 'true'

  useEffect(() => onNtfyPublishCountChange(setNtfyPushCount), [])
  useEffect(() => onNtfyReceiveCountChange(setNtfyReceiveCount), [])

  useEffect(() => {
    if (!connected || !ntfyEnabled) {
      stopNtfyListener()
      return
    }

    void startNtfyListener()

    return () => {
      stopNtfyListener()
    }
  }, [connected, ntfyEnabled])

  useEffect(() => {
    if (connected) {
      startSyncLoop({ pullIntervalMs: pullSeconds * 1_000 })
    }
  }, [connected, pullSeconds])

  useEffect(() => {
    let cancelled = false

    async function startConnectedSync() {
      await pullAndMerge()
      await pushDirtyNotes()
      await pullAndApplySyncedSettings()
      if (!cancelled) {
        setConnected(true)
      }
    }

    if (rs.connected) {
      void startConnectedSync()
    }

    onConnected(async () => {
      await startConnectedSync()
    })
    onDisconnected(() => {
      setConnected(false)
      stopSyncLoop()
      stopNtfyListener()
    })
    onRemoteChange(() => pullAndMerge())

    const onFocus = () => {
      if (rs.connected) {
        void pullAndMerge()
        void pushDirtyNotes()
      }
    }
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      stopSyncLoop()
      stopNtfyListener()
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <ConnectWidget />
      <Outlet />
      <DebugDrawer
        connected={connected}
        pullSeconds={pullSeconds}
        ntfyEnabled={ntfyEnabled}
        ntfyPushCount={ntfyPushCount}
        ntfyReceiveCount={ntfyReceiveCount}
      />
    </div>
  )
}

export const Route = createRootRoute({ component: RootLayout })
