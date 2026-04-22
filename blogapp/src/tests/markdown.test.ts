import { describe, expect, it } from 'vitest'
import { parseMarkdownToPost } from '../lib/markdown'

describe('parseMarkdownToPost', () => {
  it('extracts title from first markdown heading and removes it from body', () => {
    const parsed = parseMarkdownToPost('# Hello world\n\nThis is a post body.')
    expect(parsed.title).toBe('Hello world')
    expect(parsed.body).toBe('This is a post body.')
    expect(parsed.excerpt).toBe('This is a post body.')
  })

  it('keeps body as-is when no heading is present', () => {
    const parsed = parseMarkdownToPost('Plain content\n\nSecond line')
    expect(parsed.title).toBeNull()
    expect(parsed.body).toBe('Plain content\n\nSecond line')
    expect(parsed.excerpt).toBe('Plain content')
  })

  it('truncates long excerpt lines', () => {
    const longLine = 'a'.repeat(200)
    const parsed = parseMarkdownToPost(longLine)
    expect(parsed.excerpt.endsWith('...')).toBe(true)
    expect(parsed.excerpt.length).toBe(160)
  })
})
