// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NoteEditor } from '../components/NoteEditor'
import type { Note, SyncMetadata } from '../lib/notes'

const navigateMock = vi.fn()
const applyBodyUpdateMock = vi.fn()
const updateNoteTitleMock = vi.fn()
const archiveNoteMock = vi.fn()
const deleteNoteMock = vi.fn()
const schedulePushMock = vi.fn()
const pushDirtyNotesMock = vi.fn()
const bodyUpdateResolvers: Array<() => void> = []

let currentNote: Note | null | undefined
let currentMeta: SyncMetadata | null | undefined
let latestEditorProps: {
  value: string
  onChange: (value: string) => void
  incomingHighlightRanges?: Array<{ from: number; to: number }>
} | null = null

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../lib/db', () => ({
  updateNoteTitle: (...args: unknown[]) => updateNoteTitleMock(...args),
  applyBodyUpdate: (...args: unknown[]) => applyBodyUpdateMock(...args),
  archiveNote: (...args: unknown[]) => archiveNoteMock(...args),
  deleteNote: (...args: unknown[]) => deleteNoteMock(...args),
}))

vi.mock('../lib/dbHooks', () => ({
  useNote: () => currentNote,
  useSyncMeta: () => currentMeta,
  useSetting: () => undefined,
}))

vi.mock('../lib/sync', () => ({
  schedulePush: (...args: unknown[]) => schedulePushMock(...args),
  pushDirtyNotes: (...args: unknown[]) => pushDirtyNotesMock(...args),
}))

vi.mock('../components/SyncStatus', () => ({
  SyncStatus: () => null,
}))

vi.mock('../components/MarkdownEditor', () => ({
  MarkdownEditor: (props: typeof latestEditorProps) => {
    latestEditorProps = props
    return (
      <div
        data-testid="markdown-editor"
        data-value={props.value}
        data-highlight-count={props.incomingHighlightRanges?.length ?? 0}
      />
    )
  },
}))

describe('NoteEditor incoming highlights', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    latestEditorProps = null
    currentNote = undefined
    currentMeta = undefined
    navigateMock.mockReset()
    applyBodyUpdateMock.mockResolvedValue(undefined)
    updateNoteTitleMock.mockResolvedValue(undefined)
    archiveNoteMock.mockResolvedValue(undefined)
    deleteNoteMock.mockResolvedValue(undefined)
    schedulePushMock.mockReset()
    pushDirtyNotesMock.mockResolvedValue(undefined)
    bodyUpdateResolvers.splice(0, bodyUpdateResolvers.length)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('does not show incoming highlights when the saved body matches the local edit', async () => {
    currentNote = {
      id: 'note-1',
      title: 'Title',
      body: 'hello world',
      updatedAt: '2026-04-14T10:00:00.000Z',
    }
    currentMeta = {
      noteId: 'note-1',
      isDirty: false,
      lastConfirmedSyncAt: '2026-04-14T10:00:00.000Z',
    }

    await act(async () => {
      root.render(<NoteEditor noteId="note-1" />)
    })

    await act(async () => {
      latestEditorProps?.onChange('hello')
    })

    currentNote = {
      ...currentNote,
      body: 'hello',
      updatedAt: '2026-04-14T10:00:01.000Z',
    }
    currentMeta = {
      ...currentMeta,
      isDirty: false,
      lastConfirmedSyncAt: '2026-04-14T10:00:01.000Z',
    }

    await act(async () => {
      root.render(<NoteEditor noteId="note-1" />)
    })

    expect(latestEditorProps?.incomingHighlightRanges ?? []).toHaveLength(0)
  })

  it('shows incoming highlights when a remote body change differs from local state', async () => {
    currentNote = {
      id: 'note-1',
      title: 'Title',
      body: 'hello world',
      updatedAt: '2026-04-14T10:00:00.000Z',
    }
    currentMeta = {
      noteId: 'note-1',
      isDirty: false,
      lastConfirmedSyncAt: '2026-04-14T10:00:00.000Z',
    }

    await act(async () => {
      root.render(<NoteEditor noteId="note-1" />)
    })

    currentNote = {
      ...currentNote,
      body: 'hello brave world',
      updatedAt: '2026-04-14T10:00:01.000Z',
    }

    await act(async () => {
      root.render(<NoteEditor noteId="note-1" />)
    })

    expect((latestEditorProps?.incomingHighlightRanges?.length ?? 0) > 0).toBe(true)
  })

  it('keeps the local body when a stale note snapshot arrives during a save', async () => {
    currentNote = {
      id: 'note-1',
      title: 'Title',
      body: 'hello world',
      updatedAt: '2026-04-14T10:00:00.000Z',
    }
    currentMeta = {
      noteId: 'note-1',
      isDirty: false,
      lastConfirmedSyncAt: '2026-04-14T10:00:00.000Z',
    }

    await act(async () => {
      root.render(<NoteEditor noteId="note-1" />)
    })

    await act(async () => {
      latestEditorProps?.onChange('hello')
    })

    currentNote = {
      ...currentNote,
      body: 'hello world',
      updatedAt: '2026-04-14T10:00:01.000Z',
    }
    currentMeta = {
      ...currentMeta,
      isDirty: false,
      lastConfirmedSyncAt: '2026-04-14T10:00:01.000Z',
    }

    await act(async () => {
      root.render(<NoteEditor noteId="note-1" />)
    })

    expect(latestEditorProps?.value).toBe('hello')
  })

  it('serializes body saves so a later keystroke cannot be overwritten by an earlier save', async () => {
    currentNote = {
      id: 'note-1',
      title: 'Title',
      body: 'hello',
      updatedAt: '2026-04-14T10:00:00.000Z',
    }
    currentMeta = {
      noteId: 'note-1',
      isDirty: false,
      lastConfirmedSyncAt: '2026-04-14T10:00:00.000Z',
    }

    applyBodyUpdateMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          bodyUpdateResolvers.push(resolve)
        })
    )

    await act(async () => {
      root.render(<NoteEditor noteId="note-1" />)
    })

    applyBodyUpdateMock.mockReset()
    applyBodyUpdateMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          bodyUpdateResolvers.push(resolve)
        })
    )
    await act(async () => {
      latestEditorProps?.onChange('hello!')
      latestEditorProps?.onChange('hello!!')
    })

    expect(applyBodyUpdateMock).toHaveBeenCalledTimes(1)
    expect(applyBodyUpdateMock).toHaveBeenLastCalledWith('note-1', 'hello!')

    await act(async () => {
      bodyUpdateResolvers.shift()?.()
      await Promise.resolve()
    })

    expect(applyBodyUpdateMock).toHaveBeenCalledTimes(2)
    expect(applyBodyUpdateMock).toHaveBeenLastCalledWith('note-1', 'hello!!')
  })
})
