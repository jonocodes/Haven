import { describe, expect, it } from 'vitest'
import { computeInsertedWordHighlights } from '../lib/diffHighlights'

describe('computeInsertedWordHighlights', () => {
  it('returns empty for identical text', () => {
    expect(computeInsertedWordHighlights('hello world', 'hello world')).toEqual([])
  })

  it('highlights inserted word in the middle', () => {
    const ranges = computeInsertedWordHighlights('hello world', 'hello brave world')
    expect(ranges.length).toBe(1)
    expect('hello brave world'.slice(ranges[0].from, ranges[0].to)).toBe('brave')
  })

  it('highlights words when previous text is empty', () => {
    const ranges = computeInsertedWordHighlights('', 'new note body')
    const words = ranges.map((r) => 'new note body'.slice(r.from, r.to))
    expect(words).toEqual(['new', 'note', 'body'])
  })
})
