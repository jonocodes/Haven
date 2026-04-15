// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pullAndMergeMock = vi.fn()
const pushDirtyNotesMock = vi.fn()
const startSyncLoopMock = vi.fn()
const stopSyncLoopMock = vi.fn()
const onConnectedMock = vi.fn()
const onDisconnectedMock = vi.fn()
const onRemoteChangeMock = vi.fn()
const startNtfyListenerMock = vi.fn()
const stopNtfyListenerMock = vi.fn()

let connectedAtMount = true

vi.mock('@tanstack/react-router', () => ({
  createRootRoute: ({ component }: { component: () => JSX.Element }) => ({ component }),
  Outlet: () => null,
}))

vi.mock('../components/ConnectButton', () => ({
  ConnectWidget: () => null,
}))

vi.mock('../lib/dbHooks', () => ({
  useSetting: () => undefined,
}))

vi.mock('../lib/remotestorage', () => ({
  rs: {
    get connected() {
      return connectedAtMount
    },
  },
  onConnected: (cb: () => void) => onConnectedMock(cb),
  onDisconnected: (cb: () => void) => onDisconnectedMock(cb),
  onRemoteChange: (cb: () => void) => onRemoteChangeMock(cb),
}))

vi.mock('../lib/notify', () => ({
  onNtfyPublishCountChange: (cb: (count: number) => void) => {
    cb(0)
    return () => {}
  },
}))

vi.mock('../lib/sync', () => ({
  pullAndMerge: (...args: unknown[]) => pullAndMergeMock(...args),
  pushDirtyNotes: (...args: unknown[]) => pushDirtyNotesMock(...args),
  startSyncLoop: (...args: unknown[]) => startSyncLoopMock(...args),
  stopSyncLoop: (...args: unknown[]) => stopSyncLoopMock(...args),
  startNtfyListener: (...args: unknown[]) => startNtfyListenerMock(...args),
  stopNtfyListener: (...args: unknown[]) => stopNtfyListenerMock(...args),
}))

describe('Root sync bootstrap', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    connectedAtMount = true
    pullAndMergeMock.mockResolvedValue(undefined)
    pushDirtyNotesMock.mockResolvedValue(undefined)
    startSyncLoopMock.mockReset()
    stopSyncLoopMock.mockReset()
    onConnectedMock.mockReset()
    onDisconnectedMock.mockReset()
    onRemoteChangeMock.mockReset()
    startNtfyListenerMock.mockReset()
    stopNtfyListenerMock.mockReset()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('starts syncing immediately when already connected on mount', async () => {
    const { Route } = await import('../routes/__root')

    await act(async () => {
      root.render(<Route.component />)
    })

    expect(pullAndMergeMock).toHaveBeenCalledTimes(1)
    expect(pushDirtyNotesMock).toHaveBeenCalledTimes(1)
    expect(startSyncLoopMock).toHaveBeenCalledTimes(1)
  })
})
