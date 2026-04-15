/**
 * Cloudflare Worker — ntfy WASM bridge
 *
 * Loads the ntfy Go binary (compiled to wasip1 WASM) and bridges CF Worker
 * HTTP requests to it via stdin/stdout (CGI-style: one WASM instance per request).
 */

import { WASI } from "@cloudflare/workers-wasi";
import ntfyWasm from "../ntfy.wasm";

export default {
  async fetch(request: Request): Promise<Response> {
    const reqBytes = await serializeRequest(request);

    const { readable: stdoutReadable, writable: stdoutWritable } =
      new TransformStream<Uint8Array, Uint8Array>();
    const stdinStream = toReadableStream(reqBytes);

    const wasi = new WASI({
      stdin: stdinStream,
      stdout: stdoutWritable,
      stderr: new WritableStream({
        write(chunk) {
          console.error(new TextDecoder().decode(chunk));
        },
      }),
      returnOnExit: true,
    });

    // Go's wasip1 runtime requires poll_oneoff for goroutine scheduling (GC, timers).
    // workers-wasi stubs it to ENOSYS which causes a fatal panic. We implement a
    // minimal version that immediately fires all clock/fd subscriptions so the
    // scheduler can continue without blocking.
    //
    // mem is set after instance creation (before any WASM code runs).
    let mem: WebAssembly.Memory;

    const ENOSYS = 52;

    // WASI subscription struct layout (48 bytes):
    //   0: userdata (u64)
    //   8: tag (u8): 0=clock, 1=fd_read, 2=fd_write
    //
    // WASI event struct layout (32 bytes):
    //   0:  userdata (u64)
    //   8:  error (u16)
    //   10: type (u8)
    //   16: fd_readwrite.nbytes (u64)
    //   24: fd_readwrite.flags (u16)
    function poll_oneoff(
      in_ptr: number,
      out_ptr: number,
      nsubscriptions: number,
      nevents_ptr: number,
    ): number {
      if (!mem) return ENOSYS;
      const view = new DataView(mem.buffer);
      let nevents = 0;

      for (let i = 0; i < nsubscriptions; i++) {
        const sub = in_ptr + i * 48;
        const ev = out_ptr + i * 32;
        const ud_lo = view.getUint32(sub + 0, true);
        const ud_hi = view.getUint32(sub + 4, true);
        const tag = view.getUint8(sub + 8);

        view.setUint32(ev + 0, ud_lo, true);   // userdata lo
        view.setUint32(ev + 4, ud_hi, true);   // userdata hi
        view.setUint16(ev + 8, 0, true);        // error = success
        view.setUint8(ev + 10, tag);            // event type
        // fire immediately (nbytes=0, flags=0 for both clock and fd events)
        view.setBigUint64(ev + 16, 0n, true);
        view.setUint16(ev + 24, 0, true);
        nevents++;
      }

      view.setUint32(nevents_ptr, nevents, true);
      return 0;
    }

    const instance = new WebAssembly.Instance(ntfyWasm, {
      wasi_snapshot_preview1: {
        ...wasi.wasiImport,
        poll_oneoff,
        // Go runtime imports these socket syscalls even when not used.
        sock_accept: () => ENOSYS,
        sock_recv: () => ENOSYS,
        sock_send: () => ENOSYS,
        sock_shutdown: () => ENOSYS,
      },
    });

    // Set mem after instance creation; poll_oneoff runs only during wasi.start().
    mem = instance.exports.memory as WebAssembly.Memory;

    const [responseBytes] = await Promise.all([
      readAll(stdoutReadable),
      wasi.start(instance),
    ]);

    console.log(`ntfy-wasm stdout: ${responseBytes.length} bytes`);
    return parseResponse(responseBytes);
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toReadableStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function serializeRequest(req: Request): Promise<Uint8Array> {
  const url = new URL(req.url);
  const path = url.pathname + (url.search || "");

  const bodyBytes =
    req.method !== "GET" && req.method !== "HEAD"
      ? new Uint8Array(await req.arrayBuffer())
      : new Uint8Array(0);

  const lines: string[] = [];
  lines.push(`${req.method} ${path} HTTP/1.1`);
  lines.push(`Host: ${url.host || "localhost"}`);

  for (const [key, value] of req.headers.entries()) {
    if (key.toLowerCase() === "content-length") continue;
    if (key.toLowerCase() === "transfer-encoding") continue;
    lines.push(`${key}: ${value}`);
  }

  if (bodyBytes.length > 0) {
    lines.push(`Content-Length: ${bodyBytes.length}`);
  }

  lines.push("", "");

  const headerBytes = new TextEncoder().encode(lines.join("\r\n"));
  const out = new Uint8Array(headerBytes.length + bodyBytes.length);
  out.set(headerBytes, 0);
  out.set(bodyBytes, headerBytes.length);
  return out;
}

async function readAll(readable: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = readable.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

function parseResponse(raw: Uint8Array): Response {
  const text = new TextDecoder().decode(raw);
  const sep = text.indexOf("\r\n\r\n");
  if (sep === -1) {
    return new Response("bad gateway: malformed response from ntfy wasm", { status: 502 });
  }

  const [statusLine, ...headerLines] = text.slice(0, sep).split("\r\n");
  const body = text.slice(sep + 4);
  const statusMatch = statusLine.match(/^HTTP\/\S+\s+(\d+)/);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;

  const headers = new Headers({ "access-control-allow-origin": "*" });
  for (const line of headerLines) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    if (name === "transfer-encoding") continue;
    headers.set(name, line.slice(colon + 1).trim());
  }

  return new Response(body || null, { status, headers });
}
