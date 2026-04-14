import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ConnectButton } from '../components/ConnectButton'
import { rs, onConnected, onDisconnected } from '../lib/remotestorage'
import { startSyncLoop, stopSyncLoop, pullAndMerge, pushDirtyNotes } from '../lib/sync'

function RootLayout() {
  const [connected, setConnected] = useState(rs.connected)

  useEffect(() => {
    onConnected(async () => {
      setConnected(true)
      await pullAndMerge()
      await pushDirtyNotes()
      startSyncLoop()
    })
    onDisconnected(() => {
      setConnected(false)
      stopSyncLoop()
    })

    // Resume on focus
    const onFocus = () => {
      if (rs.connected) {
        pushDirtyNotes()
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="border-b border-gray-100 px-4 py-2 flex justify-end">
        <ConnectButton connected={connected} />
      </div>
      <Outlet />
    </div>
  )
}

export const Route = createRootRoute({ component: RootLayout })
