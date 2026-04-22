import { useEffect, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { Table } from '@lezer/markdown'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import {
  editorTheme,
  linkPlugin,
  livePreviewPlugin,
  markdownStylePlugin,
} from 'codemirror-live-markdown'

interface Props {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
}

const baseTheme = EditorView.theme({
  '&': {
    fontSize: '14px',
    borderRadius: '0.5rem',
    border: '1px solid #cbd5e1',
    backgroundColor: '#fff',
  },
  '.cm-content': {
    padding: '0.75rem',
    minHeight: '24rem',
    lineHeight: '1.65',
  },
  '.cm-focused': {
    outline: 'none',
  },
})

export function MarkdownEditor({ value, onChange, readOnly = false }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!hostRef.current) return

    const readOnlyExtension = (EditorState as { readOnly?: { of: (value: boolean) => unknown } }).readOnly?.of(readOnly)

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ extensions: [Table], codeLanguages: languages }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        livePreviewPlugin,
        markdownStylePlugin,
        linkPlugin(),
        editorTheme,
        baseTheme,
        ...(readOnlyExtension ? [readOnlyExtension] : []),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
      ],
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [readOnly])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return

    const selection = view.state.selection.main
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: {
        anchor: Math.min(selection.anchor, value.length),
        head: Math.min(selection.head, value.length),
      },
    })
  }, [value])

  return <div ref={hostRef} />
}
