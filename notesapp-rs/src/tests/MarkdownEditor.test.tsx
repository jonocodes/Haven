// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let latestView: {
  state: {
    docText: string
    doc: { toString: () => string }
    selection: { main: { anchor: number; head: number } }
    extensions: unknown[]
  }
  hasFocus: boolean
  dispatch: (args: {
    changes?: { from: number; to: number; insert: string }
    selection?: { anchor: number; head: number }
  }) => void
  updateListener?: (update: { docChanged: boolean; state: { doc: { toString: () => string } } }) => void
} | null = null

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    static lineWrapping = {}
    static decorations = { from: () => ({}) }
    static theme = () => ({})
    static updateListener = {
      of: (fn: (update: { docChanged: boolean; state: { doc: { toString: () => string } } }) => void) => ({
        kind: 'updateListener',
        fn,
      }),
    }

    state
    parent
    hasFocus = false
    updateListener

    constructor({ state, parent }: { state: MockEditorView['state']; parent: HTMLElement }) {
      this.state = state
      this.parent = parent
      const listenerExtension = state.extensions.find(
        (extension: unknown) =>
          typeof extension === 'object' &&
          extension !== null &&
          'kind' in extension &&
          extension.kind === 'updateListener'
      ) as { kind: 'updateListener'; fn: MockEditorView['updateListener'] } | undefined

      this.updateListener = listenerExtension?.fn
      latestView = this
    }

    dispatch(args: {
      changes?: { from: number; to: number; insert: string }
      selection?: { anchor: number; head: number }
    }) {
      if (args.changes) {
        const current = this.state.docText
        this.state.docText =
          current.slice(0, args.changes.from) +
          args.changes.insert +
          current.slice(args.changes.to)
      }
      if (args.selection) {
        this.state.selection.main = args.selection
      }
      if (args.changes && this.updateListener) {
        this.updateListener({
          docChanged: true,
          state: { doc: { toString: () => this.state.docText } },
        })
      }
    }

    destroy() {}
  }

  return {
    Decoration: {
      none: {},
      mark: () => ({}),
    },
    EditorView: MockEditorView,
    keymap: {
      of: () => ({}),
    },
  }
})

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: ({ doc, extensions }: { doc: string; extensions: unknown[] }) => {
      const state = {
        docText: doc,
        doc: { toString: () => state.docText },
        selection: { main: { anchor: 0, head: 0 } },
        extensions,
      }
      return state
    },
  },
  RangeSetBuilder: class {
    add() {}
    finish() {
      return {}
    }
  },
  StateEffect: {
    define: () => {
      const effect = {
        of: (value: unknown) => ({
          value,
          is: (candidate: unknown) => candidate === effect,
        }),
      }
      return effect
    },
  },
  StateField: {
    define: () => ({
      init: true,
    }),
  },
}))

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: () => ({}),
}))

vi.mock('@lezer/markdown', () => ({
  Table: {},
}))

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [],
  historyKeymap: [],
  history: () => ({}),
}))

vi.mock('codemirror-live-markdown', () => ({
  livePreviewPlugin: {},
  markdownStylePlugin: {},
  editorTheme: {},
  imageField: () => ({}),
  linkPlugin: () => ({}),
}))

import { MarkdownEditor } from '../components/MarkdownEditor'

describe('MarkdownEditor external sync', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const onChange = vi.fn()

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    latestView = null
    onChange.mockReset()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('applies a focused external update while preserving selection', async () => {
    await act(async () => {
      root.render(<MarkdownEditor value="hello" syncRevision={0} onChange={onChange} />)
    })

    if (!latestView) throw new Error('editor view not initialized')
    latestView.hasFocus = true
    latestView.state.selection.main = { anchor: 3, head: 3 }

    await act(async () => {
      root.render(<MarkdownEditor value="hello world" syncRevision={1} onChange={onChange} />)
    })

    expect(latestView.state.doc.toString()).toBe('hello world')
    expect(latestView.state.selection.main).toEqual({ anchor: 3, head: 3 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not fire onChange when syncing an external value into the editor', async () => {
    await act(async () => {
      root.render(<MarkdownEditor value="before" syncRevision={0} onChange={onChange} />)
    })

    await act(async () => {
      root.render(<MarkdownEditor value="after" syncRevision={1} onChange={onChange} />)
    })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not clobber local typing when the parent re-renders with the same sync revision', async () => {
    await act(async () => {
      root.render(<MarkdownEditor value="hello" syncRevision={0} onChange={onChange} />)
    })

    if (!latestView) throw new Error('editor view not initialized')

    act(() => {
      latestView.dispatch({ changes: { from: 5, to: 5, insert: ' world' } })
    })

    await act(async () => {
      root.render(<MarkdownEditor value="hello world" syncRevision={0} onChange={onChange} />)
    })

    expect(latestView.state.doc.toString()).toBe('hello world')
  })

  it('does not overwrite a local edit when the parent re-renders with a stale value', async () => {
    await act(async () => {
      root.render(<MarkdownEditor value="hello" syncRevision={0} onChange={onChange} />)
    })

    if (!latestView) throw new Error('editor view not initialized')

    act(() => {
      latestView.dispatch({ changes: { from: 5, to: 5, insert: ' world' } })
    })

    await act(async () => {
      root.render(<MarkdownEditor value="hello" syncRevision={0} onChange={onChange} />)
    })

    expect(latestView.state.doc.toString()).toBe('hello world')
    expect(onChange).toHaveBeenCalledWith('hello world')
  })

  it('hydrates initial external content after mounting with an empty doc', async () => {
    await act(async () => {
      root.render(<MarkdownEditor value="" syncRevision={0} onChange={onChange} />)
    })

    if (!latestView) throw new Error('editor view not initialized')
    expect(latestView.state.doc.toString()).toBe('')

    await act(async () => {
      root.render(<MarkdownEditor value="loaded note body" syncRevision={0} onChange={onChange} />)
    })

    expect(latestView.state.doc.toString()).toBe('loaded note body')
    expect(onChange).not.toHaveBeenCalled()
  })
})
