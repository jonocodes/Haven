import RemoteStorage from 'remotestoragejs'
import type { GardenIndex, GardenPostMeta } from './types'

export const rs = new RemoteStorage({ logging: true })

const dropboxAppKey = import.meta.env.VITE_DROPBOX_APP_KEY
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
if (dropboxAppKey || googleClientId) {
  rs.setApiKeys({
    ...(dropboxAppKey ? { dropbox: dropboxAppKey } : {}),
    ...(googleClientId ? { googledrive: googleClientId } : {}),
  })
}

const RS_MODULE = import.meta.env.VITE_RS_MODULE ?? 'loam'
const PUBLIC_DIR = import.meta.env.VITE_PUBLIC_DIR ?? RS_MODULE

rs.access.claim(RS_MODULE, 'rw')
rs.caching.enable(`/${RS_MODULE}/`)
rs.setSyncInterval(2000)

function privateClient() {
  return rs.scope(`/${RS_MODULE}/`)
}

function publicClient() {
  return rs.scope(`/public/${PUBLIC_DIR}/`)
}

function itemUrl(path: string): string | null {
  const url = publicClient().getItemURL(path)
  return typeof url === 'string' ? url : null
}

const POSTS_PATH = 'posts/'
const META_PATH = 'meta/'
const INDEX_PATH = 'index.json'
const FEED_PATH = 'feed.json'
const SETTINGS_PATH = 'settings/garden.json'

export function connectRemoteStorage(userAddress: string): void {
  rs.connect(userAddress)
}

export function disconnectRemoteStorage(): void {
  rs.disconnect()
}

export function isConnected(): boolean {
  return rs.connected
}

export function onConnected(cb: () => void): void {
  rs.on('connected', cb)
}

export function onDisconnected(cb: () => void): void {
  rs.on('disconnected', cb)
}

export function getPublicPostUrl(id: string): string | null {
  return itemUrl(`${POSTS_PATH}${id}.md`)
}

export function getPublicIndexUrl(): string | null {
  return itemUrl(INDEX_PATH)
}

export function getPublicFeedUrl(): string | null {
  return itemUrl(FEED_PATH)
}

export function getPublicScopePath(): string {
  return `/public/${PUBLIC_DIR}/`
}

export function getGardenSettingsUrl(): string | null {
  const url = privateClient().getItemURL(SETTINGS_PATH)
  return typeof url === 'string' ? url : null
}

export async function storePostMarkdown(id: string, markdown: string): Promise<void> {
  await publicClient().storeFile('text/markdown', `${POSTS_PATH}${id}.md`, markdown)
}

export async function pullPostMarkdown(id: string): Promise<string | null> {
  const result = await publicClient().getFile(`${POSTS_PATH}${id}.md`)
  if (!result?.data) return null

  if (typeof result.data === 'string') {
    return result.data
  }

  if (result.data instanceof ArrayBuffer) {
    return new TextDecoder().decode(result.data)
  }

  return await (result.data as Blob).text()
}

export async function removePostMarkdown(id: string): Promise<void> {
  await publicClient().remove(`${POSTS_PATH}${id}.md`)
}

export async function storePostMeta(meta: GardenPostMeta): Promise<void> {
  await privateClient().storeFile('application/json', `${META_PATH}${meta.id}.json`, JSON.stringify(meta))
}

export async function pullPostMeta(id: string): Promise<GardenPostMeta | null> {
  const result = await privateClient().getFile(`${META_PATH}${id}.json`)
  if (!result?.data) return null
  return JSON.parse(result.data as string) as GardenPostMeta
}

export async function removePostMeta(id: string): Promise<void> {
  await privateClient().remove(`${META_PATH}${id}.json`)
}

export async function listPostMetaIds(): Promise<string[]> {
  const listing = await privateClient().getListing(META_PATH)
  if (!listing) return []

  return Object.keys(listing)
    .filter((key) => key.endsWith('.json'))
    .map((key) => key.slice(0, -'.json'.length))
}

export async function pullAllPostMeta(): Promise<GardenPostMeta[]> {
  const ids = await listPostMetaIds()
  const all = await Promise.all(ids.map((id) => pullPostMeta(id)))
  return all.filter((item): item is GardenPostMeta => item !== null)
}

export async function storeIndex(index: GardenIndex): Promise<void> {
  await publicClient().storeFile('application/json', INDEX_PATH, JSON.stringify(index))
}

export async function pullIndex(): Promise<GardenIndex | null> {
  const result = await publicClient().getFile(INDEX_PATH)
  if (!result?.data) return null
  return JSON.parse(result.data as string) as GardenIndex
}

export async function storeFeed(feed: unknown): Promise<void> {
  await publicClient().storeFile('application/json', FEED_PATH, JSON.stringify(feed))
}

export async function markdownExists(id: string): Promise<boolean> {
  const result = await publicClient().getFile(`${POSTS_PATH}${id}.md`)
  return Boolean(result?.data)
}

export async function storeGardenSetting(key: string, value: string): Promise<void> {
  const result = await privateClient().getFile(SETTINGS_PATH)
  const current = result?.data ? (JSON.parse(result.data as string) as Record<string, string>) : {}
  current[key] = value

  await privateClient().storeFile('application/json', SETTINGS_PATH, JSON.stringify(current))
}

export async function pullGardenSetting(key: string): Promise<string | null> {
  const result = await privateClient().getFile(SETTINGS_PATH)
  if (!result?.data) return null

  const settings = JSON.parse(result.data as string) as Record<string, string>
  return settings[key] ?? null
}
