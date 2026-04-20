/**
 * Minimal in-memory remoteStorage server for e2e testing.
 *
 * Implements enough of draft-dejong-remotestorage-13 to support the app:
 *  - WebFinger discovery
 *  - OAuth implicit grant (auto-accepts — no login form)
 *  - File CRUD with ETags
 *  - Directory listings
 *  - Full CORS
 *
 * Storage is per-user and lives entirely in memory.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http'
import type { AddressInfo } from 'net'

interface StoredFile {
  content: Buffer
  contentType: string
  etag: string
}

export class RsServer {
  private server: ReturnType<typeof createServer>
  /** Map<`/storage/{user}/{path}`, StoredFile> */
  private storage = new Map<string, StoredFile>()
  /** Assigned after start() resolves */
  port = 0

  constructor() {
    this.server = createServer((req, res) => this.handle(req, res))
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        this.port = (this.server.address() as AddressInfo).port
        resolve()
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) =>
      this.server.close((err) => (err ? reject(err) : resolve()))
    )
  }

  /** Base URL for storage, e.g. http://127.0.0.1:PORT */
  get baseUrl() {
    return `http://127.0.0.1:${this.port}`
  }

  // ─── request dispatcher ──────────────────────────────────────────────────

  private handle(req: IncomingMessage, res: ServerResponse) {
    this.cors(res)

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    const url = new URL(req.url!, this.baseUrl)

    if (url.pathname === '/.well-known/webfinger') {
      this.webfinger(url, res)
    } else if (url.pathname.startsWith('/oauth/')) {
      this.oauth(url, res)
    } else if (url.pathname.startsWith('/storage/')) {
      this.storage_handler(req, res, url)
    } else {
      res.writeHead(404)
      res.end('Not found')
    }
  }

  // ─── CORS ─────────────────────────────────────────────────────────────────

  private cors(res: ServerResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, Origin, If-Match, If-None-Match'
    )
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, HEAD, OPTIONS')
    res.setHeader('Access-Control-Expose-Headers', 'ETag, Content-Type, Content-Length')
  }

  // ─── WebFinger ────────────────────────────────────────────────────────────

  private webfinger(url: URL, res: ServerResponse) {
    const resource = url.searchParams.get('resource') ?? ''
    // resource = "acct:user@host"
    const user = resource.replace(/^acct:/, '').split('@')[0]

    const body = JSON.stringify({
      links: [
        {
          href: `${this.baseUrl}/storage/${user}`,
          rel: 'http://tools.ietf.org/id/draft-dejong-remotestorage',
          type: 'draft-dejong-remotestorage-13',
          properties: {
            'http://remotestorage.io/spec/version': 'draft-dejong-remotestorage-13',
            'http://tools.ietf.org/html/rfc6749#section-4.2': `${this.baseUrl}/oauth/${user}`,
            'http://remotestorage.io/spec/web-authoring': null,
            'https://tools.ietf.org/html/rfc7233': null,
          },
        },
      ],
    })

    res.setHeader('Content-Type', 'application/jrd+json')
    res.writeHead(200)
    res.end(body)
  }

  // ─── OAuth implicit grant ─────────────────────────────────────────────────

  private oauth(url: URL, res: ServerResponse) {
    // /oauth/{user}?redirect_uri=...&state=...&scope=...&response_type=token
    const user = url.pathname.split('/')[2]
    const redirectUri = url.searchParams.get('redirect_uri') ?? ''
    const state = url.searchParams.get('state') ?? ''
    const scope = url.searchParams.get('scope') ?? ''

    // Issue a deterministic test token — no login form needed
    const token = `rs-test-token-${user}`

    const redirect = new URL(redirectUri)
    redirect.hash =
      `access_token=${token}&token_type=bearer` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=${encodeURIComponent(scope)}`

    res.setHeader('Location', redirect.toString())
    res.writeHead(302)
    res.end()
  }

  // ─── storage CRUD ─────────────────────────────────────────────────────────

  private storage_handler(req: IncomingMessage, res: ServerResponse, url: URL) {
    const key = url.pathname // e.g. /storage/user/notes-app/common/notes/abc.json

    // Verify Bearer token (accept any non-empty token for test flexibility)
    const auth = req.headers['authorization'] ?? ''
    if (!auth.startsWith('Bearer ')) {
      res.writeHead(401)
      res.end('Unauthorized')
      return
    }

    const isDir = key.endsWith('/')

    if (isDir) {
      if (req.method === 'GET' || req.method === 'HEAD') {
        this.listDir(key, res, req.method === 'HEAD')
      } else {
        res.writeHead(405)
        res.end()
      }
      return
    }

    switch (req.method) {
      case 'GET':
      case 'HEAD':
        this.getFile(key, res, req.method === 'HEAD')
        break
      case 'PUT':
        this.putFile(req, res, key)
        break
      case 'DELETE':
        this.deleteFile(key, res)
        break
      default:
        res.writeHead(405)
        res.end()
    }
  }

  private getFile(key: string, res: ServerResponse, headOnly: boolean) {
    const file = this.storage.get(key)
    if (!file) {
      res.writeHead(404)
      res.end()
      return
    }
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('ETag', file.etag)
    res.setHeader('Content-Length', file.content.length)
    res.writeHead(200)
    res.end(headOnly ? undefined : file.content)
  }

  private putFile(req: IncomingMessage, res: ServerResponse, key: string) {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const content = Buffer.concat(chunks)
      const etag = `"${Date.now()}-${Math.random().toString(36).slice(2)}"`
      this.storage.set(key, {
        content,
        contentType: (req.headers['content-type'] as string) || 'application/octet-stream',
        etag,
      })
      res.setHeader('ETag', etag)
      res.writeHead(200)
      res.end()
    })
  }

  private deleteFile(key: string, res: ServerResponse) {
    const existed = this.storage.delete(key)
    res.writeHead(existed ? 200 : 404)
    res.end()
  }

  private listDir(prefix: string, res: ServerResponse, headOnly: boolean) {
    const items: Record<string, { ETag: string; 'Content-Type': string; 'Content-Length': number }> = {}
    const childDirs = new Set<string>()

    for (const [k, v] of this.storage.entries()) {
      if (!k.startsWith(prefix)) continue
      const rel = k.slice(prefix.length)
      if (rel.length === 0) continue

      const slash = rel.indexOf('/')
      if (slash === -1) {
        items[rel] = {
          ETag: v.etag,
          'Content-Type': v.contentType,
          'Content-Length': v.content.length,
        }
        continue
      }

      childDirs.add(`${rel.slice(0, slash)}/`)
    }

    for (const dir of childDirs) {
      items[dir] = {
        ETag: `"dir-${prefix}${dir}"`,
        'Content-Type': 'application/ld+json',
        'Content-Length': 0,
      }
    }

    const body = JSON.stringify({
      '@context': 'http://remotestorage.io/spec/folder-description',
      items,
    })

    res.setHeader('Content-Type', 'application/ld+json')
    res.setHeader('ETag', `"${Buffer.from(body).toString('base64')}"`)
    res.setHeader('Content-Length', Buffer.byteLength(body))
    res.writeHead(200)
    res.end(headOnly ? undefined : body)
  }
}
