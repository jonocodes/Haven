import { describe, expect, it } from 'vitest'
import { buildDatedSlugId, ensureUniqueSlugId, slugifyTitle } from '../lib/ids'

describe('slug id helpers', () => {
  it('slugifies common titles', () => {
    expect(slugifyTitle('Hello, Remote Storage!')).toBe('hello-remote-storage')
    expect(slugifyTitle("Sam's First Post")).toBe('sams-first-post')
  })

  it('builds dated slug ids', () => {
    const id = buildDatedSlugId('My First Post', new Date('2026-04-22T10:00:00Z'))
    expect(id).toBe('2026-04-22-my-first-post')
  })

  it('ensures unique ids by numeric suffixing', () => {
    const unique = ensureUniqueSlugId('2026-04-22-my-first-post', [
      '2026-04-22-my-first-post',
      '2026-04-22-my-first-post-2',
    ])

    expect(unique).toBe('2026-04-22-my-first-post-3')
  })
})
