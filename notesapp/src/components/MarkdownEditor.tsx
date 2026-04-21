import { useEffect, useRef } from 'react'
import { Decoration, type DecorationSet, EditorView, keymap } from '@codemirror/view'
import { EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { Table } from '@lezer/markdown'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import {
  livePreviewPlugin,
  markdownStylePlugin,
  editorTheme,
  imageField,
  linkPlugin,
} from 'codemirror-live-markdown'

interface Props {
  value: string
  onChange?: (value: string) => void
  incomingHighlightRanges?: Array<{ from: number; to: number }>
  syncRevision?: number
  readOnly?: boolean
}

const setIncomingHighlightsEffect = StateEffect.define<Array<{ from: number; to: number }>>()
const clearIncomingHighlightsEffect = StateEffect.define<void>()

const incomingHighlightsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(decorations, tr) {
    let next = decorations.map(tr.changes)
    for (const effect of tr.effects) {
      if (effect.is(clearIncomingHighlightsEffect)) {
        next = Decoration.none
      }
      if (effect.is(setIncomingHighlightsEffect)) {
        const builder = new RangeSetBuilder<Decoration>()
        for (const range of effect.value) {
          if (range.to > range.from) {
            builder.add(range.from, range.to, Decoration.mark({ class: 'cm-incoming-change' }))
          }
        }
        next = builder.finish()
      }
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

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

export function MarkdownEditor({ value, onChange, incomingHighlightRanges = [], syncRevision, readOnly = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const clearTimerRef = useRef<number | null>(null)
  const suppressNextChangeRef = useRef(false)
  const syncRevisionRef = useRef<number | undefined>(undefined)
  const hasAppliedExternalValueRef = useRef(false)
  onChangeRef.current = onChange

  // Mount editor once
  useEffect(() => {
    if (!containerRef.current) return

    const readOnlyExtension = (EditorState as { readOnly?: { of: (value: boolean) => unknown } }).readOnly?.of(readOnly)

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ extensions: [Table] }),
        livePreviewPlugin,
        markdownStylePlugin,
        imageField(),
        linkPlugin(),
        editorTheme,
        baseTheme,
        incomingHighlightsField,
        ...(readOnlyExtension ? [readOnlyExtension] : []),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            if (suppressNextChangeRef.current) {
              suppressNextChangeRef.current = false
              return
            }
            onChangeRef.current?.(update.state.doc.toString())
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
  }, [readOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync remote value changes into editor without disrupting local edits
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) {
      syncRevisionRef.current = syncRevision
      return
    }
    if (!hasAppliedExternalValueRef.current) {
      hasAppliedExternalValueRef.current = true
    } else if (syncRevisionRef.current === syncRevision) {
      return
    }

    syncRevisionRef.current = syncRevision
    const selection = view.state.selection.main
    suppressNextChangeRef.current = true
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: {
        anchor: Math.min(selection.anchor, value.length),
        head: Math.min(selection.head, value.length),
      },
    })
  }, [syncRevision, value])

  useEffect(() => {
    const view = viewRef.current
    if (!view || incomingHighlightRanges.length === 0) return

    view.dispatch({ effects: setIncomingHighlightsEffect.of(incomingHighlightRanges) })

    if (clearTimerRef.current) {
      window.clearTimeout(clearTimerRef.current)
    }
    clearTimerRef.current = window.setTimeout(() => {
      view.dispatch({ effects: clearIncomingHighlightsEffect.of(undefined) })
      clearTimerRef.current = null
    }, 4500)
  }, [incomingHighlightRanges])

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current)
        clearTimerRef.current = null
      }
    }
  }, [])

  return <div ref={containerRef} className="w-full" />
}
