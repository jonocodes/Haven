import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "./ntfy_like_worker";

async function req(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("cfty", () => {
  it("GET / returns help text", async () => {
    const res = await req("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("cfty");
  });

  it("GET /:topic returns stats", async () => {
    const res = await req("/my-topic");
    expect(res.status).toBe(200);
    const stats = await res.json() as any;
    expect(stats.topic).toBe("my-topic");
    expect(stats.subscribers).toBe(0);
    expect(stats.published).toBe(0);
  });

  it("POST /:topic with no subscribers returns published event", async () => {
    const res = await req("/my-topic", { method: "POST", body: "hello" });
    expect(res.status).toBe(200);
    const event = await res.json() as any;
    expect(event.event).toBe("message");
    expect(event.message).toBe("hello");
    expect(event.topic).toBe("my-topic");
  });

  it("pub/sub: subscriber receives published message", async () => {
    const topic = "pubsub-test";

    const sseCtx = createExecutionContext();
    const decoder = new TextDecoder();

    // Subscribe first — deadlock is fixed so this returns immediately
    const sseRes = await worker.fetch(
      new Request(`http://localhost/${topic}/sse`),
      env,
      sseCtx,
    );
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get("content-type")).toContain("text/event-stream");

    const reader = sseRes.body!.getReader();
    const readChunk = async () => decoder.decode((await reader.read()).value);

    // Open event
    const openChunk = await readChunk();
    expect(openChunk).toContain("event: open");

    // Publish
    const pubRes = await req(`/${topic}`, { method: "POST", body: "hello subscriber" });
    expect(pubRes.status).toBe(200);

    // Message event delivered to subscriber
    const msgChunk = await readChunk();
    expect(msgChunk).toContain("event: message");
    expect(msgChunk).toContain("hello subscriber");

    reader.cancel();
  });

  it("POST with Title header includes title in event", async () => {
    const res = await req("/titled-topic", {
      method: "POST",
      body: "body text",
      headers: { Title: "My Title" },
    });
    const event = await res.json() as any;
    expect(event.title).toBe("My Title");
    expect(event.message).toBe("body text");
  });

  it("unknown path returns 404", async () => {
    const res = await req("/a/b/c");
    expect(res.status).toBe(404);
  });

  it("unsupported method returns 405", async () => {
    const res = await req("/my-topic", { method: "DELETE" });
    expect(res.status).toBe(405);
  });
});
