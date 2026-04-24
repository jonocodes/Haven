export function encodeIndexToken(url: string): string {
  return btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function decodeIndexToken(token: string): string | null {
  try {
    const encoded = token.includes(':') ? token.slice(token.lastIndexOf(':') + 1) : token
    const padded = encoded + '==='.slice((encoded.length + 3) % 4)
    const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
    return decoded.startsWith('http') ? decoded : null
  } catch {
    return null
  }
}
