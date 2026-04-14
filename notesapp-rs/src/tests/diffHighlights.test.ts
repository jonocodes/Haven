import { describe, expect, it } from 'vitest'
import { computeInsertedWordHighlights } from '../lib/diffHighlights'

describe('computeInsertedWordHighlights', () => {
  it('returns empty for identical text', () => {
    expect(computeInsertedWordHighlights('hello world', 'hello world')).toEqual([])
  })

  it('highlights inserted word in the middle', () => {
    const ranges = computeInsertedWordHighlights('hello world', 'hello brave world')
    expect(ranges.length).toBe(1)
    expect('hello brave world'.slice(ranges[0].from, ranges[0].to)).toBe('brave ')
  })

  it('highlights the full inserted body when previous text is empty', () => {
    const ranges = computeInsertedWordHighlights('', 'new note body')
    expect(ranges).toEqual([{ from: 0, to: 13 }])
  })
})
