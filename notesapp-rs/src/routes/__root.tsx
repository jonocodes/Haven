import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ConnectWidget } from '../components/ConnectButton'
import { onNtfyPublishCountChange } from '../lib/notify'
import { rs, onConnected, onDisconnected, onRemoteChange } from '../lib/remotestorage'
import { startNtfyListener, startSyncLoop, stopNtfyListener, stopSyncLoop, pullAndMerge, pushDirtyNotes } from '../lib/sync'
import { useSetting } from '../lib/dbHooks'

function fmt(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString()
}

function parsePullIntervalSeconds(value: string | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 5
  return Math.max(1, Math.min(300, Math.round(parsed)))
}

function StatusBar({
  connected,
  pullSeconds,
  ntfyEnabled,
  ntfyPushCount,
}: {
  connected: boolean
  pullSeconds: number
  ntfyEnabled: boolean
  ntfyPushCount: number
}) {
  const lastPushAt = useSetting('lastPushAt')
  const lastPullAt = useSetting('lastPullAt')
  const [now, setNow] = useState(() => new Date().toLocaleTimeString())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="fixed bottom-0 left-0 px-3 py-1.5 flex items-center gap-3 text-xs text-gray-400 select-none">
      <span>{now}</span>
      {connected && (
        <>
          <span>↑ {fmt(lastPushAt)}</span>
          <span>↓ {fmt(lastPullAt)}</span>
          <span>pull {pullSeconds}s</span>
          <span>ntfy {ntfyEnabled ? 'on' : 'off'}</span>
          <span>ntfy pushes {ntfyPushCount}</span>
        </>
      )}
    </div>
  )
}

function RootLayout() {
  const [connected, setConnected] = useState(rs.connected)
  const [ntfyPushCount, setNtfyPushCount] = useState(0)
  const pullIntervalSetting = useSetting('pullIntervalSeconds')
  const ntfyEnabledSetting = useSetting('ntfyEnabled')
  const pullSeconds = parsePullIntervalSeconds(pullIntervalSetting)
  const ntfyEnabled = ntfyEnabledSetting === 'true'

  useEffect(() => onNtfyPublishCountChange(setNtfyPushCount), [])

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
      <StatusBar
        connected={connected}
        pullSeconds={pullSeconds}
        ntfyEnabled={ntfyEnabled}
        ntfyPushCount={ntfyPushCount}
      />
    </div>
  )
}

export const Route = createRootRoute({ component: RootLayout })
