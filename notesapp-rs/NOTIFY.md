Here’s a clean, structured doc you can drop into another LLM or use as a design reference.

---

# Realtime Sync Architecture with remotestorage.js + ntfy

## Goal

Provide near-realtime cross-browser updates for a single document using:

* **remoteStorage.js** → source of truth (durable sync)
* **ntfy (or similar)** → lightweight realtime invalidation signal

Avoid:

* excessive sync cycles
* per-keystroke network chatter
* hosting custom backend infrastructure

---

## Core Design Principles

### 1. Separate Responsibilities

* **remoteStorage.js**

  * Stores and syncs actual document data
  * Handles durability, offline, conflict resolution

* **Realtime channel (ntfy)**

  * Sends *only* “document changed” notifications
  * Never sends actual document content

---

### 2. Invalidation, Not Replication

Realtime messages mean:

> “This document is stale — refresh it”

NOT:

> “Apply this exact change”

---

### 3. Coalescing Is Required

Never emit events per keystroke.

Instead:

* batch writes
* batch notifications
* batch incoming syncs

---

## Data Model

Single document:

```txt
/documents/current
```

ntfy message:

```json
{
  "type": "doc-changed",
  "docId": "current",
  "version": 42,
  "ts": 1710000000000
}
```

---

## Sender Flow (Editing Browser)

### 1. Local Edits

User types → update local state immediately

```js
state.text = newValue;
version += 1;
```

---

### 2. Debounced Save to remoteStorage

```js
debounce(500ms):
  client.storeObject("doc", "current", state)
```

Optional:

```js
await rs.startSync(); // flush faster
```

---

### 3. Throttled Notification

```js
throttle(1500–2000ms):
  sendNtfy({
    type: "doc-changed",
    docId: "current",
    version
  })
```

---

### 4. Flush on Important Events

Always force save + notify on:

* blur
* submit
* navigation
* tab close

---

## Receiver Flow (Other Browser)

### 1. Listen for Notifications

```js
onNtfyMessage(msg)
```

---

### 2. Debounce Incoming Events

```js
debounce(300–800ms):
  process notifications
```

---

### 3. Targeted Fetch (NOT full sync)

```js
const doc = await client.getObject("current", 0);
render(doc);
```

Key detail:

* `maxAge = 0` forces freshness check
* Only this document is refreshed
* No full `startSync()` needed

---

## Sync Behavior Clarification

### Sender

* `storeObject()` → schedules sync
* `startSync()` → syncs **all cached paths**

### Receiver

* `getObject(path, 0)` → refreshes **only that path**
* may check parent folder metadata
* **does NOT trigger full sync**

---

## Timing Strategy

| Action                 | Timing       |
| ---------------------- | ------------ |
| Text input save        | 400–700 ms   |
| Toggle/checkbox save   | immediate    |
| Notification send      | 1000–2000 ms |
| Incoming sync debounce | 300–800 ms   |

---

## Event Coalescing Model

Typing 100 characters:

```txt
100 keystrokes
→ 1–2 remoteStorage writes
→ 1–2 ntfy messages
→ 1 receiver refresh
```

NOT:

```txt
100 keystrokes
→ 100 writes
→ 100 notifications
→ 100 syncs
```

---

## Optional Optimization

### Avoid redundant notifications

Track last sent version:

```js
if (version !== lastNotifiedVersion) {
  send notification
}
```

---

### Batch incoming updates

```js
Set pendingDocIds

debounce:
  for each docId:
    getObject(docId, 0)
```

---

## Why This Works

* remoteStorage already:

  * syncs local writes quickly
  * maintains cache
  * handles offline

* ntfy provides:

  * instant cross-browser wake-up

* targeted reads avoid:

  * full sync cycles
  * unnecessary network load

---

## Limitations

* Not true realtime collaboration (no CRDT/OT)
* Last-write-wins behavior
* No per-keystroke merging

---

## When to Upgrade Architecture

Move beyond this setup if you need:

* simultaneous editing with conflict merging
* cursor presence
* per-keystroke sync

Then consider:

* CRDT systems (Automerge, Yjs)
* PartyKit / WebSocket-based rooms

---

## Summary

```txt
Write → debounce → storeObject
      → throttle → notify

Receive → debounce → getObject(path, 0)
        → render
```

**remoteStorage = source of truth**
**ntfy = invalidate + wake-up**

---

If you want, I can turn this into:

* a reusable helper module
* or a minimal working example app (sender + receiver)
