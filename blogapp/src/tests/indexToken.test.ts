import { describe, expect, it } from 'vitest'
import { decodeIndexToken, encodeIndexToken } from '../lib/indexToken'

describe('indexToken', () => {
  const url = 'https://storage.5apps.com/user/public/loam/index.json'

  it('roundtrips a URL', () => {
    expect(decodeIndexToken(encodeIndexToken(url))).toBe(url)
  })

  it('returns null for random text', () => {
    expect(decodeIndexToken('badtoken')).toBeNull()
  })

  it('returns null for valid base64 that is not a URL', () => {
    // "hello world" in base64 — parses fine but is not a URL
    expect(decodeIndexToken('aGVsbG8gd29ybGQ')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(decodeIndexToken('')).toBeNull()
  })

  it('supports prefix:encoded format', () => {
    const token = `jono:${encodeIndexToken(url)}`
    expect(decodeIndexToken(token)).toBe(url)
  })
})
