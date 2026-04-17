import { getSetting, setSetting } from './db'

export type NoteChangeOperation = 'upsert' | 'delete'

export interface NoteChangedNotification {
  type: 'note-changed'
  noteId: string
  op: NoteChangeOperation
  senderDeviceId: string
  ts: number
}

const DEVICE_ID_SETTING = 'ntfyDeviceId'
const DEFAULT_NTFY_SERVER = 'https://ntfy.sh'

let deviceIdPromise: Promise<string> | null = null
let ntfyPublishCount = 0
let ntfyReceiveCount = 0
const publishCountListeners = new Set<(count: number) => void>()
const receiveCountListeners = new Set<(count: number) => void>()

function emitPublishCount(): void {
  for (const listener of publishCountListeners) {
    listener(ntfyPublishCount)
  }
}

function emitReceiveCount(): void {
  for (const listener of receiveCountListeners) {
    listener(ntfyReceiveCount)
  }
}

export function onNtfyPublishCountChange(listener: (count: number) => void): () => void {
  publishCountListeners.add(listener)
  listener(ntfyPublishCount)
  return () => {
    publishCountListeners.delete(listener)
  }
}

export function onNtfyReceiveCountChange(listener: (count: number) => void): () => void {
  receiveCountListeners.add(listener)
  listener(ntfyReceiveCount)
  return () => {
    receiveCountListeners.delete(listener)
  }
}

function createDeviceId(): string {
  const random = crypto.getRandomValues(new Uint8Array(12))
  const hex = Array.from(random, (value) => value.toString(16).padStart(2, '0')).join('')
  return `dvc_${hex}`
}

export async function getDeviceId(): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      const existing = await getSetting(DEVICE_ID_SETTING)
      if (existing) return existing
      const created = createDeviceId()
      await setSetting(DEVICE_ID_SETTING, created)
      return created
    })()
  }
  return deviceIdPromise
}

function normalizeUrl(input: string | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function normalizeTopic(input: string | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  return trimmed || null
}

function resolveTopicUrl(serverSetting: string | undefined, topicSetting: string | undefined): string | null {
  const server = normalizeUrl(serverSetting) ?? DEFAULT_NTFY_SERVER
  const topic = normalizeTopic(topicSetting)
  if (!topic) return null
  return `${server}/${topic}`
}

async function getNotifyConfig(): Promise<{ enabled: boolean; topicUrl: string | null; deviceId: string }> {
  const [enabledSetting, serverSetting, topicSetting] = await Promise.all([
    getSetting('ntfyEnabled'),
    getSetting('ntfyServerUrl'),
    getSetting('ntfyTopic'),
  ])
  return {
    enabled: enabledSetting === 'true',
    topicUrl: resolveTopicUrl(serverSetting, topicSetting),
    deviceId: await getDeviceId(),
  }
}

export async function publishNoteChanged(noteId: string, op: NoteChangeOperation): Promise<void> {
  const { enabled, topicUrl, deviceId } = await getNotifyConfig()
  if (!enabled || !topicUrl) return

  const payload: NoteChangedNotification = {
    type: 'note-changed',
    noteId,
    op,
    senderDeviceId: deviceId,
    ts: Date.now(),
  }

  console.log('[ntfy] publishing', payload, 'to', topicUrl)

  const response = await fetch(topicUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Title': 'notes-changed',
      'X-Tags': 'arrows_counterclockwise',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`ntfy publish failed (${response.status})`)
  }

  ntfyPublishCount += 1
  emitPublishCount()
  console.log('[ntfy] published successfully')
}

export interface NtfySubscription {
  close: () => void
}

export async function subscribeToNoteChanges(
  onMessage: (message: NoteChangedNotification) => void,
  onError?: (error: unknown) => void,
): Promise<NtfySubscription | null> {
  const { enabled, topicUrl, deviceId } = await getNotifyConfig()
  if (!enabled || !topicUrl) return null

  const sseUrl = `${topicUrl}/sse?json=1`
  console.log('[ntfy] connecting to', sseUrl)
  const source = new EventSource(sseUrl)

  source.onmessage = (event: MessageEvent<string>) => {
    try {
      console.log('[ntfy] received raw event:', event.data)
      const ntfyMessage = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      const parsed = JSON.parse(ntfyMessage.message) as Partial<NoteChangedNotification>
      console.log('[ntfy] received', parsed)
      if (parsed.type !== 'note-changed') return
      if (typeof parsed.noteId !== 'string') return
      if (parsed.op !== 'upsert' && parsed.op !== 'delete') return
      if (parsed.senderDeviceId === deviceId) {
        console.log('[ntfy] ignoring our own message')
        return
      }

      console.log('[ntfy] processing message for note', parsed.noteId, parsed.op)
      ntfyReceiveCount += 1
      emitReceiveCount()

      onMessage({
        type: 'note-changed',
        noteId: parsed.noteId,
        op: parsed.op,
        senderDeviceId: parsed.senderDeviceId ?? 'unknown',
        ts: typeof parsed.ts === 'number' ? parsed.ts : Date.now(),
      })
    } catch (error) {
      onError?.(error)
    }
  }

  source.onerror = (error) => {
    console.log('[ntfy] EventSource error', error)
    onError?.(error)
  }

  return {
    close: () => source.close(),
  }
}
