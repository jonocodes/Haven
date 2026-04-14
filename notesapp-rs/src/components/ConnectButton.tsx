import { useState } from 'react'
import { rs } from '../lib/remotestorage'

interface Props {
  connected: boolean
}

export function ConnectButton({ connected }: Props) {
  const [address, setAddress] = useState('')
  const [open, setOpen] = useState(false)

  function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    if (!address.trim()) return
    rs.connect(address.trim())
  }

  function handleDisconnect() {
    rs.disconnect()
  }

  if (connected) {
    return (
      <button
        onClick={handleDisconnect}
        className="text-xs text-gray-500 hover:text-red-500 underline"
      >
        Disconnect remoteStorage
      </button>
    )
  }

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-blue-500 hover:underline"
        >
          Connect remoteStorage to sync your notes
        </button>
      ) : (
        <form onSubmit={handleConnect} className="flex gap-2 items-center">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="user@example.com or provider"
            className="text-sm border border-gray-300 rounded px-2 py-1 flex-1 focus:outline-none focus:border-blue-400"
            autoFocus
          />
          <button
            type="submit"
            className="text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
          >
            Connect
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  )
}
