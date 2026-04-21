import RemoteStorage from "remotestoragejs";
import { createBodyState } from "./crdt";
import type { RemoteNote } from "./notes";
import { getSetting } from "./db";
import { getRxCollections } from "./rxdb";

export const rs = new RemoteStorage({ logging: true });

const dropboxAppKey = import.meta.env.VITE_DROPBOX_APP_KEY;
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
if (dropboxAppKey || googleClientId) {
  rs.setApiKeys({
    ...(dropboxAppKey ? { dropbox: dropboxAppKey } : {}),
    ...(googleClientId ? { googledrive: googleClientId } : {}),
  });
}

rs.access.claim("notes-app", "rw");
rs.caching.enable("/notes-app/");
rs.setSyncInterval(2000);

function client() {
  return rs.scope("/notes-app/");
}

const NOTES_PATH = "common/notes/";
const TOMBSTONES_PATH = "common/tombstones/";
const PUBLIC_NOTES_PATH = 'shared/';
const SYNCED_SETTINGS_PATH = "common/settings/sync.json";

export interface PublicNote {
  version: 1
  title: string
  body: string
  updatedAt: string
}

function publicClient() {
  return rs.scope('/public/notes-app/')
}

function toPublicNote(note: RemoteNote): PublicNote {
  return {
    version: 1,
    title: note.title,
    body: note.body,
    updatedAt: note.updatedAt,
  }
}

export interface SyncedSettings {
  version: 1;
  updatedAt: string;
  updatedBy: string;
  ntfy: {
    enabled: boolean;
    serverUrl: string;
    topic: string;
  };
}

export async function pushNote(note: RemoteNote): Promise<void> {
  await client().storeFile(
    "application/json",
    `${NOTES_PATH}${note.id}.json`,
    JSON.stringify(note),
  );

  if (note.share?.published && note.share?.shareId) {
    await publicClient().storeFile(
      'application/json',
      `${PUBLIC_NOTES_PATH}${note.share.shareId}.json`,
      JSON.stringify(toPublicNote(note)),
    )
  }
}

export async function publishNote(note: RemoteNote): Promise<{ shareId: string; publicUrl: string }> {
  const shareId = note.share?.shareId || crypto.randomUUID()
  const publicNote = toPublicNote({
    ...note,
    share: {
      published: true,
      shareId,
      publishedAt: note.share?.publishedAt ?? note.updatedAt,
    },
  })

  await publicClient().storeFile(
    'application/json',
    `${PUBLIC_NOTES_PATH}${shareId}.json`,
    JSON.stringify(publicNote),
  )

  return {
    shareId,
    publicUrl: publicClient().getItemURL(`${PUBLIC_NOTES_PATH}${shareId}.json`),
  }
}

export async function unpublishNoteByShareId(shareId: string): Promise<void> {
  await publicClient().remove(`${PUBLIC_NOTES_PATH}${shareId}.json`)
}

export function getPublicNoteUrl(shareId: string): string {
  return publicClient().getItemURL(`${PUBLIC_NOTES_PATH}${shareId}.json`)
}

export async function pullNote(id: string): Promise<RemoteNote | null> {
  const result = await client().getFile(`${NOTES_PATH}${id}.json`);
  if (!result?.data) return null;
  const parsed = JSON.parse(result.data as string) as RemoteNote;
  return {
    ...parsed,
    crdtState: parsed.crdtState ?? createBodyState(parsed.body),
  };
}

export async function listRemoteNoteIds(): Promise<string[]> {
  const listing = await client().getListing(NOTES_PATH);
  if (!listing) return [];
  return Object.keys(listing)
    .filter((k) => k.endsWith(".json"))
    .map((k) => k.slice(0, -5));
}

export async function pullAllNotes(): Promise<RemoteNote[]> {
  const ids = await listRemoteNoteIds();
  const notes = await Promise.all(ids.map((id) => pullNote(id)));
  return notes.filter((n): n is RemoteNote => n !== null);
}

export async function pushSyncedSettings(settings: SyncedSettings): Promise<void> {
  await client().storeFile("application/json", SYNCED_SETTINGS_PATH, JSON.stringify(settings));
}

export async function pullSyncedSettings(): Promise<SyncedSettings | null> {
  const result = await client().getFile(SYNCED_SETTINGS_PATH);
  if (!result?.data) return null;
  return JSON.parse(result.data as string) as SyncedSettings;
}

export async function pullAndApplySyncedSettings(): Promise<SyncedSettings | null> {
  const remote = await pullSyncedSettings();
  if (!remote) return null;

  const remoteUpdatedAt = new Date(remote.updatedAt).getTime();
  const localUpdatedAtStr = await getSetting("syncedSettingsUpdatedAt");
  const localUpdatedAt = localUpdatedAtStr ? new Date(localUpdatedAtStr).getTime() : 0;

  if (remoteUpdatedAt > localUpdatedAt) {
    const collections = await getRxCollections();
    await Promise.all([
      collections.settings.upsert({ key: "ntfyEnabled", value: String(remote.ntfy.enabled) }),
      collections.settings.upsert({ key: "ntfyServerUrl", value: remote.ntfy.serverUrl }),
      collections.settings.upsert({ key: "ntfyTopic", value: remote.ntfy.topic }),
      collections.settings.upsert({ key: "syncedSettingsUpdatedAt", value: remote.updatedAt }),
    ]);
  }

  return remote;
}

export async function hasRemoteTombstone(id: string): Promise<boolean> {
  const result = await client().getFile(`${TOMBSTONES_PATH}${id}.json`);
  return Boolean(result?.data);
}

export async function pushTombstone(id: string): Promise<void> {
  await client().storeFile(
    "application/json",
    `${TOMBSTONES_PATH}${id}.json`,
    JSON.stringify({ deletedAt: new Date().toISOString() }),
  );
  await client().remove(`${NOTES_PATH}${id}.json`);
}

export async function listRemoteTombstoneIds(): Promise<string[]> {
  const listing = await client().getListing(TOMBSTONES_PATH);
  if (!listing) return [];
  return Object.keys(listing)
    .filter((k) => k.endsWith(".json"))
    .map((k) => k.slice(0, -5));
}

export function isConnected(): boolean {
  return rs.connected;
}

export function onConnected(cb: () => void): void {
  rs.on("connected", cb);
}

export function onDisconnected(cb: () => void): void {
  rs.on("disconnected", cb);
}

export function onRemoteChange(cb: () => void): void {
  client().on("change", (event: { origin: string }) => {
    if (event.origin === "remote") cb();
  });
}
