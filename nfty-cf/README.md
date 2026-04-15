# nfty-cf

Run [ntfy](https://ntfy.sh) (the Go push notification server) inside a Cloudflare Worker via WebAssembly.

---

## Goal

ntfy is a lightweight pub/sub notification service written in Go. The goal here is to run ntfy's actual server binary — compiled to WASM — inside a Cloudflare Worker, so you get ntfy's protocol and behaviour at the edge without managing a separate server.

The key insight: a CF Worker handles the socket layer (HTTP connections, SSE streams), and the ntfy WASM handles the business logic (routing, rate limiting, message fan-out).

---

## Architecture

```
browser/client
      │
      ▼
Cloudflare Worker  (src/worker.ts)
  - receives HTTP request
  - serializes it as HTTP/1.1 wire format
  - writes to WASM stdin
  - reads HTTP/1.1 response from WASM stdout
  - returns response to client
      │  stdin/stdout (CGI-style)
      ▼
ntfy Go binary  (compiled to wasip1 WASM → ntfy.wasm)
  - receives serialized request via stdin
  - runs it through ntfy's HTTP handler
  - writes HTTP/1.1 response to stdout
  - exits (one WASM instance per request)
```

The WASM is run using [`@cloudflare/workers-wasi`](https://github.com/cloudflare/workers-wasi), which implements the WASI preview1 syscall interface inside V8.

---

## Why WASM instead of TypeScript?

There is already a working TypeScript reimplementation (`../cfty/`) that does live pub/sub with SSE. The goal here is to use **ntfy's actual Go code** so we get exact protocol compatibility with existing ntfy clients (the ntfy Android/iOS apps, CLI, etc.).

---

## Persistence / SQLite

ntfy normally uses SQLite for:
- Message history / replay
- User auth
- Web push subscriptions

In a CF Worker, SQLite files don't persist between requests. For the target use case — **live-only pub/sub** (publish → immediately fan out to currently-connected SSE subscribers, no replay) — none of those databases are needed. ntfy supports this mode via:

```
cache-duration: 0        → no message history (nop cache)
auth-file: ""            → no user management
web-push-public-key: ""  → no web push
attachment-cache-dir: "" → no file attachments
```

The WASM is configured this way in `wasm/main.go`.

---

## Project structure

```
nfty-cf/
  src/
    worker.ts          TypeScript CF Worker — socket layer + WASI bridge
  wasm/
    main.go            Go entry point — reads stdin, runs ntfy handler, writes stdout
    go.mod             Go module (requires heckel.io/ntfy/v2)
    shim/
      sqlite3.go       No-op stub replacing mattn/go-sqlite3 (which needs CGo)
      go.mod           Declares module github.com/mattn/go-sqlite3
    ntfy/              Local clone of ntfy v2.11.0 (with patches, see below)
    build.sh           Build script: compiles ntfy.wasm
  ntfy.wasm            Compiled WASM binary (gitignored — run build.sh to produce)
  wrangler.jsonc       Cloudflare Worker config
  package.json         JS deps (wrangler, workers-wasi)
  .flox/               Flox environment (includes Go)
```

---

## Setup

### 1. Install deps

```bash
flox activate   # installs Go + Node tooling
bun install
```

### 2. Build the WASM

```bash
cd wasm
bash build.sh
# → produces ../ntfy.wasm (~8MB compressed)
```

### 3. Run locally

```bash
npm run dev
# → http://localhost:8787
```

---

## What works

- [x] ntfy Go source compiles to `wasip1` WASM (37MB uncompressed, ~8MB compressed)
- [x] Go's CGo dependency on `mattn/go-sqlite3` replaced with a no-op shim
- [x] Missing WASI socket syscalls stubbed (`sock_accept`, `sock_recv`, `sock_send`, `sock_shutdown`)
- [x] Go's goroutine scheduler works — `poll_oneoff` implemented in the TS worker
- [x] ntfy's `//go:embed site` and `//go:embed docs` satisfied with stubs (the web UI isn't needed)
- [x] Worker loads WASM, pipes stdin/stdout via `@cloudflare/workers-wasi`, parses HTTP/1.1 response

---

## Current blocker

ntfy's `newNopCache()` (the cache-duration=0 code path) still opens an **in-memory SQLite database**:

```go
// server/message_cache.go:309
func newNopCache() (*messageCache, error) {
    return newSqliteCache(createMemoryFilename(), ...)
    // creates: "file:randomstring?mode=memory&cache=shared"
}
```

Even though no data is persisted, it calls `database/sql.Open("sqlite3", ...)`, which requires a registered `sqlite3` driver. Our no-op shim deliberately doesn't register one (to avoid pulling in `ncruces/go-sqlite3` which has its own embedded WASM binary), so the server init fails with:

```
sql: unknown driver "sqlite3" (forgotten import?)
```

---

## Next steps

There are two paths forward:

### Option A — Patch ntfy's nopCache (recommended)

In the local `wasm/ntfy/` clone, rewrite `newNopCache()` to return a lightweight pure-in-memory struct that doesn't use `database/sql` at all. ntfy already sets `c.nop = true` and early-returns from most operations, so the implementation would be minimal:

```go
func newNopCache() (*messageCache, error) {
    return &messageCache{
        nop:    true,
        topics: make(map[string]*topic),
    }, nil
}
```

This is the cleanest fix — zero SQLite code in the WASM.

### Option B — Register `modernc.org/sqlite`

Add `modernc.org/sqlite` to the Go module and register it as the `"sqlite3"` driver in the shim. `modernc.org/sqlite` is pure Go (no CGo) and should compile to wasip1. The in-memory database would exist per-request (not persisted across requests), which is fine for the nop cache use case.

Risk: `modernc.org/sqlite` is not tested under wasip1 and may have its own syscall requirements.

---

## Known WASM / CF Workers constraints

| Constraint | Impact |
|---|---|
| No persistent filesystem | SQLite file-based caching won't work (use in-memory or D1) |
| `poll_oneoff` not in workers-wasi | Implemented manually in worker.ts |
| `sock_accept` etc. not in workers-wasi | Stubbed — Go runtime imports these even when unused |
| 10MB worker size limit (paid) | ntfy.wasm is ~8MB compressed — fits, but leaves little room |
| No threads | Go's WASM runtime is single-threaded; goroutines use cooperative scheduling via poll_oneoff |
| SSE streaming | Needs investigation — httptest.ResponseRecorder buffers the full response; ntfy's SSE handler holds the connection open, which would block forever in the current CGI model |

---

## SSE note

The current request/response model (one WASM instance per request, stdin→stdout) works for non-streaming endpoints (`POST /topic`, `GET /topic`). For SSE (`GET /topic/sse`), ntfy's handler holds the connection open indefinitely. The CGI model will need to change for SSE — likely by having the TS worker detect SSE requests and either:
- Handle SSE in TS (using a Durable Object, as in cfty), calling ntfy WASM only for publish/auth
- Or keep the WASM alive and stream stdout back as SSE chunks (requires `streamStdio: true` + asyncify, or a different transport)
