import { useEffect, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { Table } from '@lezer/markdown'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import {
  livePreviewPlugin,
  markdownStylePlugin,
  editorTheme,
  linkPlugin,
} from 'codemirror-live-markdown'

interface Props {
  value: string
  onChange: (value: string) => void
}

const baseTheme = EditorView.theme({
  '&': {
    fontSize: '14px',
    fontFamily: 'inherit',
  },
  '.cm-content': {
    padding: '0',
    minHeight: '60vh',
    caretColor: '#111',
  },
  '.cm-focused': {
    outline: 'none',
  },
  '.cm-line': {
    lineHeight: '1.65',
    color: '#374151',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
})

export function MarkdownEditor({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Mount editor once
  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ extensions: [Table] }),
        livePreviewPlugin,
        markdownStylePlugin,
        linkPlugin(),
        editorTheme,
        baseTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync remote value changes into editor without disrupting local edits
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return <div ref={containerRef} className="w-full" />
}
