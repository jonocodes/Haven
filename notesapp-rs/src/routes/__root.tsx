import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ConnectWidget } from '../components/ConnectButton'
import { rs, onConnected, onDisconnected, onRemoteChange } from '../lib/remotestorage'
import { startSyncLoop, stopSyncLoop, pullAndMerge, pushDirtyNotes } from '../lib/sync'
import { useSetting } from '../lib/dbHooks'

function fmt(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString()
}

function StatusBar({ connected }: { connected: boolean }) {
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
        </>
      )}
    </div>
  )
}

function RootLayout() {
  const [connected, setConnected] = useState(rs.connected)

  useEffect(() => {
    let cancelled = false

    async function startConnectedSync() {
      await pullAndMerge()
      await pushDirtyNotes()
      if (!cancelled) {
        startSyncLoop()
      }
    }

    if (rs.connected) {
      void startConnectedSync()
    }

    onConnected(async () => {
      setConnected(true)
      await startConnectedSync()
    })
    onDisconnected(() => {
      setConnected(false)
      stopSyncLoop()
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
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <ConnectWidget />
      <Outlet />
      <StatusBar connected={connected} />
    </div>
  )
}

export const Route = createRootRoute({ component: RootLayout })
