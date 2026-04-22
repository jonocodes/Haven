import { pullImageAsBlob, pushImageFile } from './remotestorage'

export const ASSET_PREFIX = './assets/'

const blobUrlCache = new Map<string, string>()
const reverseCache = new Map<string, string>()

function normalizeCanonicalPath(path: string): string {
  return path.startsWith(ASSET_PREFIX) ? path : `${ASSET_PREFIX}${path.replace(/^\/+/, '')}`
}

function getFileExtension(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : ''
  if (fromName) return fromName.toLowerCase()

  const mimePart = file.type.split('/')[1] ?? ''
  if (!mimePart) return 'bin'
  return mimePart.toLowerCase()
}

function getImageIdFromCanonicalPath(path: string): string {
  return normalizeCanonicalPath(path).slice(ASSET_PREFIX.length)
}

function extractImageUrls(body: string): string[] {
  const urls = new Set<string>()
  const imageRegex = /!\[[^\]]*]\(([^)\s]+)\)/g
  for (const match of body.matchAll(imageRegex)) {
    const url = match[1]
    if (url) urls.add(url)
  }
  return [...urls]
}

function replaceAllExact(text: string, replacements: Map<string, string>): string {
  let out = text
  for (const [from, to] of replacements.entries()) {
    out = out.split(from).join(to)
  }
  return out
}

export async function uploadImage(file: File): Promise<string> {
  const extension = getFileExtension(file)
  const id = `${crypto.randomUUID()}.${extension}`
  const canonicalPath = normalizeCanonicalPath(id)
  const buffer = await file.arrayBuffer()
  await pushImageFile(id, file.type || 'application/octet-stream', buffer)
  return canonicalPath
}

export async function fetchBlobUrl(canonicalPath: string): Promise<string> {
  const normalized = normalizeCanonicalPath(canonicalPath)
  const cached = blobUrlCache.get(normalized)
  if (cached) return cached

  const imageId = getImageIdFromCanonicalPath(normalized)
  const blob = await pullImageAsBlob(imageId)
  if (!blob) return normalized

  const blobUrl = URL.createObjectURL(blob)
  blobUrlCache.set(normalized, blobUrl)
  reverseCache.set(blobUrl, normalized)
  return blobUrl
}

export async function resolveBodyUrls(body: string): Promise<string> {
  const replacements = new Map<string, string>()
  const imageUrls = extractImageUrls(body).filter((url) => url.startsWith(ASSET_PREFIX))
  await Promise.all(
    imageUrls.map(async (url) => {
      const blobUrl = await fetchBlobUrl(url)
      replacements.set(url, blobUrl)
    })
  )
  return replaceAllExact(body, replacements)
}

export function canonicalizeBody(body: string): string {
  return replaceAllExact(body, reverseCache)
}
