# cfty — Cloudflare-based tiny ntfy-like service

A minimal, **SSE-first publish/subscribe service** built on Cloudflare Workers + Durable Objects.

cfty is designed as a **drop-in replacement for ntfy’s publish + SSE endpoints**, but intentionally stripped down to support one primary use case:

> **lightweight realtime “something changed” notifications**

---

# 🧠 Motivation

Most realtime systems are overkill if all you need is:

- notify other clients that data changed
- trigger a sync (e.g. remoteStorage)
- avoid polling

Typical options:

- WebSockets → heavy + stateful
- Firebase / Supabase → full backend
- Ably / Pusher → great, but more infra + auth

**ntfy gets very close**, but:
- it’s a separate service
- not always trivial to self-host at the edge

So cfty exists to be:

- extremely small
- deployable in seconds
- SSE-native (no WebSockets)
- edge-hosted
- stateless (no history)

---

# ⚡ Core Idea

```
client → POST /topic → Durable Object → broadcast → SSE clients
```

- one topic = one Durable Object
- all subscribers connect via SSE
- publishes fan out instantly
- no persistence, no replay

---

# 🚀 Features

- `POST /:topic` → publish message
- `PUT /:topic` → publish message
- `POST /:topic/json` → publish JSON message (ntfy-compatible)
- `PUT /:topic/json` → publish JSON message (ntfy-compatible)
- `GET /:topic/sse` → subscribe via SSE
- `GET /:topic` → topic stats
- `PUT /:topic/retention` → set per-topic retention duration
- `PUT /:topic/permissions` → set per-topic permissions (read/write)
- `POST /:topic/subscribe` → subscribe to WebPush notifications
- `POST /:topic/unsubscribe` → unsubscribe from WebPush
- `GET /vapidPublicKey` → get VAPID public key for WebPush
- live-only (no storage)
- per-topic rate limiting
- structured logs
- optional Basic or Bearer auth
- suitable for sync hints **and other small messages**

---

# 📦 Setup

## 1. Install

```bash
npm install
```

## 2. Run locally

```bash
npm run dev
```

Server:

```
http://127.0.0.1:8787
```

---

# 🧪 Local Testing

## Subscribe

```bash
curl -N http://127.0.0.1:8787/test/sse
```


## Publish

```bash
curl -X POST http://127.0.0.1:8787/test -d "hello world"
```

## Stats

```bash
curl http://127.0.0.1:8787/test
```

---

# 🌐 Browser Example

```js
const es = new EventSource("http://127.0.0.1:8787/test/sse");

es.onmessage = (e) => {
  console.log("message", JSON.parse(e.data));
};
```

---

# 📡 API

## Publish

```
POST /:topic
PUT  /:topic
```

Body = raw text

Optional header:

```
Title: My Title
```

---

## JSON Publish

```
POST /:topic/json
PUT  /:topic/json
```

Body = JSON object:

```json
{
  "message": "hello world",
  "title": "My Title",
  "priority": 5,
  "tags": ["tag1", "tag2"],
  "click": "https://example.com"
}
```

All fields are optional. `message` is required.

---

## Poll for Messages

```
GET /:topic?poll=<seconds>
```

Long-poll endpoint that waits for new messages. Use instead of SSE when HTTP long-polling is preferred.

Parameters:
- `poll` (required): Maximum seconds to wait (1-60)
- `since` (optional): Unix timestamp - only return messages after this time

Response (when messages arrive):

```json
{
  "topic": "my-topic",
  "messages": [
    {
      "id": "abc123",
      "time": 1700000000,
      "message": "hello"
    }
  ],
  "count": 1
}
```

Response (when timeout):

```json
{
  "topic": "my-topic",
  "messages": [],
  "count": 0,
  "timeout": true
}
```

---

## Delete Message

```
DELETE /:topic/messages/:messageId
```

Deletes a message from the replay buffer and notifies subscribers via a `delete` event.

Response:

```json
{
  "id": "abc123",
  "time": 1700000000,
  "event": "delete",
  "topic": "my-topic",
  "messageId": "xyz789"
}
```

If the message is not found in the buffer, returns `404`.

---

## Delete All Messages

```
DELETE /:topic/messages
```

Clears all messages from the replay buffer, resets the published count, and notifies subscribers via a `delete_all` event.

Response:

```json
{
  "id": "abc123",
  "time": 1700000000,
  "event": "delete_all",
  "topic": "my-topic",
  "deletedCount": 42
}
```

---

## Set Retention

```
PUT /:topic/retention
```

Sets the message retention duration for a topic. Messages older than the retention period are automatically pruned.

Request body:

```json
{
  "duration": 3600000
}
```

- `duration`: Retention duration in **milliseconds**
- Setting `duration: 0` disables time-based retention for this topic
- The global `RETENTION_DURATION_MS` env var provides a default if not set per-topic

Response:

```json
{
  "topic": "my-topic",
  "retentionDurationMs": 3600000
}
```

When a topic has retention configured, published messages automatically get an `expires` field set based on the retention period. You can also override this per-message using the `expires` field in JSON publish body.

---

## Set Permissions

```
PUT /:topic/permissions
```

Sets the access permissions for a topic (read vs write access).

Request body:

```json
{
  "permission": "read-write"
}
```

- `permission`: One of:
  - `read-write` (default) - allow both publish and subscribe
  - `read-only` - allow only subscribe (denies publish)
  - `write-only` - allow only publish (denies subscribe)
  - `none` - deny both read and write

Response:

```json
{
  "topic": "my-topic",
  "permission": "read-only"
}
```

---

## WebPush (Browser Notifications)

Enable browser push notifications so clients receive messages even when the page/app is closed.

### Get VAPID Public Key

```
GET /vapidPublicKey
```

Returns the VAPID public key needed for browser subscription.

Response:

```json
{
  "publicKey": "BAXie0dPLoKzyqJ7xFxWV66j2i3QSEz0npKYHO_2MSP..."
}
```

### Subscribe to Push Notifications

```
POST /:topic/subscribe
```

Request body (PushSubscription JSON from browser):

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

Response:

```json
{
  "topic": "my-topic",
  "subscribed": true,
  "totalSubscriptions": 1
}
```

### Unsubscribe

```
POST /:topic/unsubscribe
```

Same request body as subscribe.

Response:

```json
{
  "topic": "my-topic",
  "unsubscribed": true,
  "totalSubscriptions": 0
}
```

### Browser Integration Example

```javascript
// Get the VAPID public key
const { publicKey } = await fetch('/vapidPublicKey').then(r => r.json());

// Subscribe to push notifications
const registration = await navigator.serviceWorker.ready;
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: publicKey
});

// Send subscription to cfty
await fetch(`/my-topic/subscribe`, {
  method: 'POST',
  body: JSON.stringify(subscription.toJSON())
});
```

---

## List Messages

```
GET /:topic/messages
```

Returns the messages currently in the replay buffer.

Response:

```json
{
  "topic": "my-topic",
  "messages": [
    {
      "id": "abc123",
      "time": 1700000000,
      "message": "hello",
      "title": "My Title"
    }
  ],
  "count": 1
}
```

---

## Subscribe (SSE)

```
GET /:topic/sse
```

Events:

```
event: open
event: message
event: keepalive
```

---

## Stats

```
GET /:topic
```

Example:

```json
{
  "topic": "test",
  "subscribers": 2,
  "published": 10,
  "rateLimit": {
    "windowMs": 10000,
    "maxPublishes": 30,
    "recentPublishes": 3
  }
}
```

---

# ⚠️ Semantics (Important)

cfty is **NOT a message queue**.

It is:

> a *best-effort realtime signal bus*

Implications:

- no replay
- messages can be lost
- clients must recover state elsewhere if the message stream matters for correctness

A common pattern is:

```js
onEvent → remoteStorage.sync()
```

But cfty can also carry **other small messages** such as:
- typing indicators
- presence pings
- small control messages
- encrypted app-level payloads

If you use it for anything more important than hints, design assuming:
- messages may be missed
- subscribers may reconnect
- the stream is not durable

Also sync or refresh on:
- page load
- reconnect
- focus

---

# 🛡 Rate Limiting

Per topic:

- 30 publishes / 10 seconds

Response:

```
429 Too Many Requests
Retry-After: 10
```

A **max subscribers per topic** limit is also a good idea for public deployments.
A reasonable first cap is something like `100` subscribers per topic.

---

# 📊 Observability

Logs include:

- `sse_subscribe`
- `sse_abort`
- `publish`
- `publish_rate_limited`

View locally:

```bash
npm run tail
```

For public deployments, it is worth logging:
- topic
- subscriber count
- publish size
- rate-limited publishes

---

# 🚀 Deployment

## 1. Login

```bash
npx wrangler login
```

## 2. Deploy

```bash
npm run deploy
```

You’ll get:

```
https://<your-name>.workers.dev
```

---

## wrangler.jsonc

```jsonc
{
  "name": "cfty",
  "main": "ntfy_like_worker.ts",
  "compatibility_date": "2026-04-14",
  "observability": { "enabled": true },
  "vars": {
    "MAX_SUBSCRIBERS_PER_TOPIC": "100",
    "CACHE_DURATION_MS": "43200000",
    "AUTH_ENABLED": "true",
    "BASIC_AUTH_USER": "admin",
    "BASIC_AUTH_PASS": "change-me",
    "BEARER_AUTH_TOKEN": "change-me-too"
  },
  "durable_objects": {
    "bindings": [
      { "name": "TOPIC_HUB", "class_name": "TopicHub" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["TopicHub"] }
  ]
}
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_SUBSCRIBERS_PER_TOPIC` | `100` | Max concurrent subscribers per topic |
| `CACHE_DURATION_MS` | `0` (infinite) | Time-based message expiry in ms (e.g. `43200000` = 12h) |
| `RETENTION_DURATION_MS` | `0` (infinite) | Default per-topic message retention in ms |
| `AUTH_ENABLED` | `true` | Enable/disable auth |
| `BASIC_AUTH_USER` | - | Basic auth username |
| `BASIC_AUTH_PASS` | - | Basic auth password |
| `BEARER_AUTH_TOKEN` | - | Bearer auth token |
| `VAPID_PUBLIC_KEY` | - | VAPID public key for WebPush |
| `VAPID_PRIVATE_KEY` | - | VAPID private key for WebPush |

---

# 🔐 Authentication

cfty can support either:

- `Authorization: Basic ...`
- `Authorization: Bearer ...`

A simple approach is to accept **either** scheme globally for all endpoints:

- `POST /:topic`
- `PUT /:topic`
- `GET /:topic`
- `GET /:topic/sse`

If auth is configured, unauthenticated requests should return:

```http
401 Unauthorized
WWW-Authenticate: Basic realm="cfty"
```

## Environment variables

- `AUTH_ENABLED` (`true` by default; set `false` to disable auth globally)
- `BASIC_AUTH_USER`
- `BASIC_AUTH_PASS`
- `BEARER_AUTH_TOKEN`

Auth is enforced when credentials are present and `AUTH_ENABLED` is not set to a false-like value.
Accepted false-like values: `false`, `0`, `off`, `no`.

## Example: Basic auth

```bash
curl -u admin:change-me -X POST https://your-worker.example/test -d "hello"
```

## Example: Bearer auth

```bash
curl -H "Authorization: Bearer change-me-too" -X POST https://your-worker.example/test -d "hello"
```

## Example: Auth via query param (ntfy-compatible)

```bash
curl -X POST "https://your-worker.example/test?auth=Basic%20$(echo -n 'admin:change-me' | base64)" -d "hello"
curl -X POST "https://your-worker.example/test?auth=change-me-too" -d "hello"
```

---

## 🔄 Replay / since

When subscribing via SSE, you can request missed messages using:

```
GET /:topic/sse?since=<timestamp_or_id>
```

Or via the `Last-Event-ID` header.

The `since` parameter accepts:
- Unix timestamp in seconds (10 digits, e.g. `1700000000`)
- Unix timestamp in milliseconds (13 digits, e.g. `1700000000000`)
- A message ID to replay from that specific message

Messages are buffered in a replay buffer (up to 100 messages per topic) and sent immediately upon connection before the open event.

---

## Browser note

Native `EventSource` does not let you set arbitrary request headers directly.
So for browser subscriptions, Basic/Bearer auth is easiest when you are:

- using cookies via a proxy
- using credentials embedded in the URL only in tightly controlled environments
- or using a custom SSE fetch/polyfill instead of plain `EventSource`

For non-browser clients and ntfy-like tooling, standard `Authorization` headers work well.

# 🧹 Cleanup & Lifecycle

## Current behavior

- topics live as long as they receive traffic
- Durable Objects may stay warm while subscribers are connected
- no explicit deletion

## Implications

- inactive topics naturally fade (no traffic → no cost)
- active SSE connections keep objects alive
- zombie tabs are mostly fine if you accept the extra open subscriber

## Practical controls

### 1. Max subscribers per topic

This is the most useful safety control for public topics.

Example idea in `handleSubscribe()`:

```ts
const MAX_SUBSCRIBERS = 100;
if (this.subscribers.size >= MAX_SUBSCRIBERS) {
  return new Response("too many subscribers", { status: 429 });
}
```

### 2. Topic TTL

Optional, but usually not necessary for a live-only service.

### 3. Delete message endpoint

```
DELETE /:topic/messages/:messageId
```

Removes a message from the replay buffer and notifies subscribers.

---

# 📊 Implementation Status — ntfy Compatibility

## ✅ Implemented

### Core Endpoints
| Endpoint | Status | Notes |
|----------|--------|-------|
| `POST /:topic` | ✅ | Plain text publish |
| `PUT /:topic` | ✅ | Alias for POST |
| `POST /:topic/json` | ✅ | JSON publish with metadata |
| `PUT /:topic/json` | ✅ | Alias for POST |
| `GET /:topic/sse` | ✅ | SSE subscriptions |
| `GET /:topic/ws` | ✅ | WebSocket subscriptions |
| `GET /:topic` | ✅ | Topic stats |
| `GET /:topic?poll=<s>` | ✅ | Long-poll for messages |
| `GET /:topic/messages` | ✅ | List messages in buffer |
| `GET /:topic/auth` | ✅ | Auth check |
| `DELETE /:topic/messages/:id` | ✅ | Delete message from buffer |
| `DELETE /:topic/messages` | ✅ | Delete all messages from buffer |

### Features
| Feature | Status | Notes |
|---------|--------|-------|
| Rate limiting | ✅ | 30 publishes / 10 seconds per topic |
| Subscriber cap | ✅ | Configurable via `MAX_SUBSCRIBERS_PER_TOPIC` |
| Basic auth | ✅ | Header + query param |
| Bearer auth | ✅ | Header + query param |
| Replay buffer | ✅ | Up to 100 messages OR time-based via `CACHE_DURATION_MS` |
| Rich message metadata | ✅ | `priority`, `tags`, `click` via `/json` |
| CORS | ✅ | Full CORS headers |
| Delete message | ✅ | Removes from buffer, notifies subscribers |
| Delete all messages | ✅ | Clears buffer, resets count, notifies |
| Long-poll | ✅ | `?poll=<seconds>` wait for messages |
| Time-based cache | ✅ | `CACHE_DURATION_MS` auto-expires messages |
| Per-topic retention | ✅ | `PUT /:topic/retention` + `RETENTION_DURATION_MS` |
| Per-topic permissions | ✅ | `PUT /:topic/permissions` (read/write/none) |
| WebPush notifications | ✅ | Browser push via `/subscribe` + VAPID keys |

---

## ❌ Not Implemented

### Core (ntfy server)
| Feature | Status | Notes |
|---------|--------|-------|
| Persistent message history | ❌ | Live-only by design |
| Message attachments | ❌ | Out of scope |
| Message actions/buttons | ❌ | Out of scope |
| Message delivery delays | ❌ | Out of scope |
| Per-topic access control | ❌ | Global auth only |
| User accounts | ❌ | No user system |

### Mobile / Ecosystem
| Feature | Status | Notes |
|---------|--------|-------|
| Push notifications (iOS/Android) | ❌ | Different infrastructure |
| Android app | ❌ | Separate project |
| iOS app | ❌ | Separate project |
| Web UI | ❌ | Future consideration |
| ntfy.sh compatibility | ❌ | Self-hosted only |

### Advanced
| Feature | Status | Notes |
|---------|--------|-------|
| Per-IP rate limiting | ❌ | Future consideration |
| Topic signing (HMAC) | ❌ | Future consideration |
| gzip compression | ❌ | Future consideration |
| WebSocket to SSE bridge | ❌ | Already implemented via `/ws` |

---

## ✅ cfty-only Features

These are features unique to cfty that ntfy does not offer:

### Cloudflare Workers + Durable Objects

| Feature | Description |
|---------|-------------|
| Edge-native deployment | Runs on Cloudflare's global network |
| Automatic scaling | Durable Objects handle concurrency |
| Stateless publish/subscribe | No database required for core operation |
| Replay buffer | Up to 100 messages (configurable) |

### Per-Topic Configuration

| Feature | Description |
|---------|-------------|
| `PUT /:topic/retention` | Set per-topic message retention duration |
| `MAX_SUBSCRIBERS_PER_TOPIC` | Configurable subscriber cap per topic |
| `REPLAY_BUFFER_SIZE` | Configurable message buffer size |

### Extended SSE Features

| Feature | Description |
|---------|-------------|
| WebSocket endpoint | `GET /:topic/ws` for native WebSocket clients |
| Built-in keepalive | 25s interval (configurable) |
| Poll timeout | `?poll=<seconds>` long-poll with timeout response |

### Enhanced Observability

| Feature | Description |
|---------|-------------|
| Structured JSON logs | All events logged as JSON objects |
| Stats endpoint | `GET /:topic` returns subscriber count, publish count, rate limit info |
| Rate limit headers | `Retry-After` header on 429 responses |

---

## 🔮 Future Ideas

These are potential enhancements, not guaranteed:

- Per-IP rate limiting
- Topic signing (HMAC URLs)
- gzip compression for SSE
- Simple web UI
- Delete topic endpoint

---

# ✨ Use Cases

- remoteStorage sync hints
- collaborative apps (lightweight)
- browser tab coordination
- presence / typing indicators
- small encrypted app-level messages

---

# 🔐 Optional client-side encryption

Because cfty is public and does not know anything about your app semantics, a useful pattern is:

> **encrypt only the message body on the client**

That keeps the service simple while still allowing private payloads.

A practical split is:

- leave transport metadata in the clear
  - topic
  - title
  - event type
  - timestamps
- encrypt only the message body / payload

That way cfty can still route and log basic operational information, while your app controls confidentiality.

## Example message shape

Publish a JSON body as the message string:

```json
{
  "type": "chat",
  "body": "<encrypted-base64-or-jwe>",
  "nonce": "...",
  "version": 1
}
```

Since cfty treats the message as opaque text, encryption is entirely your responsibility.

## Example workflow

### Publisher

```js
async function publishEncrypted(topic, plaintext, cryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoded,
  );

  const payload = {
    type: "message",
    body: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    nonce: btoa(String.fromCharCode(...iv)),
    version: 1,
  };

  await fetch(`https://your-cfty.example/${topic}`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      "Title": "encrypted-message",
    },
    body: JSON.stringify(payload),
  });
}
```

### Subscriber

```js
async function subscribeEncrypted(topic, cryptoKey) {
  const es = new EventSource(`https://your-cfty.example/${topic}/sse`);

  es.addEventListener("message", async (event) => {
    const outer = JSON.parse(event.data);
    const payload = JSON.parse(outer.message);

    if (payload.type !== "message") return;

    const iv = Uint8Array.from(atob(payload.nonce), (c) => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(payload.body), (c) => c.charCodeAt(0));

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      ciphertext,
    );

    console.log(new TextDecoder().decode(plaintext));
  });

  return es;
}
```

This is only an example workflow. In a real app, you would usually:
- encode binary more carefully than `btoa`
- version your payload format
- rotate keys intentionally
- validate message types before decrypting

---

# 🧾 Summary

cfty is:

- tiny
- fast
- edge-native
- SSE-first
- good for sync hints and other small messages

and intentionally *not*:

- durable
- complex
- aware of your message semantics

---

If you need guarantees → use a queue.
If you need realtime hints or small ephemeral messages → use cfty.
