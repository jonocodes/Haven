import RemoteStorage from "remotestoragejs";
import { createBodyState } from './crdt'
import type { RemoteNote } from "./notes";

export const rs = new RemoteStorage({ logging: true });

rs.access.claim("notes-app", "rw");
rs.caching.enable("/notes-app/");
rs.setSyncInterval(2000);

function client() {
  return rs.scope("/notes-app/");
}

const NOTES_PATH = "common/notes/";
const TOMBSTONES_PATH = "common/tombstones/";

export async function pushNote(note: RemoteNote): Promise<void> {
  await client().storeFile(
    "application/json",
    `${NOTES_PATH}${note.id}.json`,
    JSON.stringify(note),
  );
}

export async function pullNote(id: string): Promise<RemoteNote | null> {
  const result = await client().getFile(`${NOTES_PATH}${id}.json`);
  if (!result?.data) return null;
  const parsed = JSON.parse(result.data as string) as RemoteNote
  return {
    ...parsed,
    crdtState: parsed.crdtState ?? createBodyState(parsed.body),
  }
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
