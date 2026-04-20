import { describe, expect, it } from 'vitest'
import { parseMarkdownToNote } from '../lib/importMarkdown'

describe('parseMarkdownToNote', () => {
  it('uses first markdown heading as title and removes it from body', () => {
    const parsed = parseMarkdownToNote('# Shopping List\n\n- apples\n- milk\n', 'todo.md')
    expect(parsed.title).toBe('Shopping List')
    expect(parsed.body).toContain('- apples')
    expect(parsed.body).not.toContain('# Shopping List')
  })

  it('falls back to filename when no heading exists', () => {
    const parsed = parseMarkdownToNote('plain body text', 'journal-entry.md')
    expect(parsed.title).toBe('journal-entry')
    expect(parsed.body).toBe('plain body text')
  })
})
