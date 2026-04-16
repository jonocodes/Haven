import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "./ntfy_like_worker";

async function req(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function reqWithCtx(path: string, init?: RequestInit) {
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

  describe("JSON publish", () => {
    it("POST /:topic/json publishes with priority", async () => {
      const res = await req("/json-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "json message", priority: 5 }),
      });
      expect(res.status).toBe(200);
      const event = await res.json() as any;
      expect(event.event).toBe("message");
      expect(event.message).toBe("json message");
      expect(event.priority).toBe(5);
    });

    it("POST /:topic/json publishes with tags", async () => {
      const res = await req("/json-tags-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "tagged", tags: ["alert", "urgent"] }),
      });
      expect(res.status).toBe(200);
      const event = await res.json() as any;
      expect(event.tags).toEqual(["alert", "urgent"]);
    });

    it("POST /:topic/json publishes with click", async () => {
      const res = await req("/json-click-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "clickable", click: "https://example.com" }),
      });
      expect(res.status).toBe(200);
      const event = await res.json() as any;
      expect(event.click).toBe("https://example.com");
    });

    it("PUT /:topic/json works as alias", async () => {
      const res = await req("/json-put-test", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "put works" }),
      });
      expect(res.status).toBe(200);
      const event = await res.json() as any;
      expect(event.message).toBe("put works");
    });
  });

  describe("auth", () => {
    it("authorized request with Basic auth succeeds", async () => {
      const res = await req("/auth-topic", {
        method: "POST",
        body: "hello",
        headers: { Authorization: "Basic YWRtaW46Y2hhbmdlLW1l" },
      });
      expect(res.status).toBe(200);
    });

    it("authorized request with Bearer auth succeeds", async () => {
      const res = await req("/auth-topic", {
        method: "POST",
        body: "hello",
        headers: { Authorization: "Bearer change-me-too" },
      });
      expect(res.status).toBe(200);
    });

    it("unauthorized request without credentials fails", async () => {
      const res = await req("/auth-topic", {
        method: "POST",
        body: "hello",
      });
      expect(res.status).toBe(401);
    });

    it("unauthorized request with wrong credentials fails", async () => {
      const res = await req("/auth-topic", {
        method: "POST",
        body: "hello",
        headers: { Authorization: "Basic wrong:credentials" },
      });
      expect(res.status).toBe(401);
    });

    it("auth query param with Basic works", async () => {
      const res = await req("/auth-topic?auth=Basic%20YWRtaW46Y2hhbmdlLW1l", {
        method: "POST",
        body: "hello",
      });
      expect(res.status).toBe(200);
    });

    it("auth query param with Bearer works", async () => {
      const res = await req("/auth-topic?auth=change-me-too", {
        method: "POST",
        body: "hello",
      });
      expect(res.status).toBe(200);
    });

    it("GET /:topic/auth returns success when authorized", async () => {
      const res = await req("/auth-topic/auth", {
        headers: { Authorization: "Basic YWRtaW46Y2hhbmdlLW1l" },
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
    });
  });

  describe("replay buffer", () => {
    it("subscriber receives missed events via since query", async () => {
      const topic = "replay-test";

      // Publish some messages first
      await req(`/${topic}`, { method: "POST", body: "first" });
      await req(`/${topic}`, { method: "POST", body: "second" });
      await req(`/${topic}`, { method: "POST", body: "third" });

      const sseCtx = createExecutionContext();
      const decoder = new TextDecoder();

      const sseRes = await worker.fetch(
        new Request(`http://localhost/${topic}/sse?since=1`),
        env,
        sseCtx,
      );
      expect(sseRes.status).toBe(200);

      const reader = sseRes.body!.getReader();
      const readChunk = async () => decoder.decode((await reader.read()).value);

      // Should receive open event
      const openChunk = await readChunk();
      expect(openChunk).toContain("event: open");

      // Should receive missed messages
      const msg1 = await readChunk();
      expect(msg1).toContain("first");

      const msg2 = await readChunk();
      expect(msg2).toContain("second");

      const msg3 = await readChunk();
      expect(msg3).toContain("third");

      reader.cancel();
    });

    it("subscriber receives missed events via Last-Event-ID header", async () => {
      const topic = "replay-header-test";

      // Publish a message and get its ID
      const pubRes = await req(`/${topic}`, { method: "POST", body: "marker" });
      const pubEvent = await pubRes.json() as any;
      const firstId = pubEvent.id;

      // Publish more
      await req(`/${topic}`, { method: "POST", body: "after" });

      const sseCtx = createExecutionContext();
      const decoder = new TextDecoder();

      const sseRes = await worker.fetch(
        new Request(`http://localhost/${topic}/sse`, {
          headers: { "Last-Event-ID": firstId },
        }),
        env,
        sseCtx,
      );
      expect(sseRes.status).toBe(200);

      const reader = sseRes.body!.getReader();
      const readChunk = async () => decoder.decode((await reader.read()).value);

      // Open event
      const openChunk = await readChunk();
      expect(openChunk).toContain("event: open");

      // Only the second message should be received
      const msgChunk = await readChunk();
      expect(msgChunk).toContain("after");
      expect(msgChunk).not.toContain("marker");

      reader.cancel();
    });
  });

  describe("stats", () => {
    it("stats include rate limit info", async () => {
      const res = await req("/stats-test");
      const stats = await res.json() as any;
      expect(stats.rateLimit).toBeDefined();
      expect(stats.rateLimit.windowMs).toBe(10000);
      expect(stats.rateLimit.maxPublishes).toBe(30);
    });

    it("published count increments", async () => {
      await req("/count-test", { method: "POST", body: "msg1" });
      await req("/count-test", { method: "POST", body: "msg2" });
      const res = await req("/count-test");
      const stats = await res.json() as any;
      expect(stats.published).toBeGreaterThanOrEqual(2);
    });

    it("subscriber count increments when subscribed", async () => {
      const topic = "sub-count-test";
      const sseCtx = createExecutionContext();
      const sseRes = await worker.fetch(
        new Request(`http://localhost/${topic}/sse`),
        env,
        sseCtx,
      );
      expect(sseRes.status).toBe(200);

      const res = await req(`/${topic}`);
      const stats = await res.json() as any;
      expect(stats.subscribers).toBeGreaterThanOrEqual(1);

      sseRes.body!.getReader().cancel();
    });
  });

  describe("SSE headers", () => {
    it("returns correct content-type", async () => {
      const sseCtx = createExecutionContext();
      const sseRes = await worker.fetch(
        new Request(`http://localhost/headers-test/sse`),
        env,
        sseCtx,
      );
      expect(sseRes.headers.get("content-type")).toContain("text/event-stream");
    });

    it("returns no-cache headers", async () => {
      const sseCtx = createExecutionContext();
      const sseRes = await worker.fetch(
        new Request(`http://localhost/headers-test/sse`),
        env,
        sseCtx,
      );
      expect(sseRes.headers.get("cache-control")).toBe("no-cache, no-store, must-revalidate");
    });

    it("returns accel-buffering header", async () => {
      const sseCtx = createExecutionContext();
      const sseRes = await worker.fetch(
        new Request(`http://localhost/headers-test/sse`),
        env,
        sseCtx,
      );
      expect(sseRes.headers.get("x-accel-buffering")).toBe("no");
    });
  });

  describe("CORS", () => {
    it("returns CORS headers on success", async () => {
      const res = await req("/cors-test");
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("returns CORS headers on 404", async () => {
      const res = await req("/a/b/c");
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("returns CORS headers on 401", async () => {
      const res = await req("/cors-test", {
        method: "POST",
        body: "hello",
      });
      expect(res.status).toBe(401);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("handles OPTIONS preflight", async () => {
      const res = await req("/cors-test", {
        method: "OPTIONS",
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-methods")).toContain("GET");
      expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    });
  });

  describe("PUT /:topic", () => {
    it("PUT works like POST", async () => {
      const res = await req("/put-test", {
        method: "PUT",
        body: "put message",
      });
      expect(res.status).toBe(200);
      const event = await res.json() as any;
      expect(event.message).toBe("put message");
    });
  });

  describe("error handling", () => {
    it("invalid topic name returns 400", async () => {
      const res = await req("/   ", { method: "POST", body: "hello" });
      expect(res.status).toBe(400);
    });

    it("topic name too long returns 400", async () => {
      const longName = "a".repeat(201);
      const res = await req(`/${longName}`, { method: "POST", body: "hello" });
      expect(res.status).toBe(400);
    });

    it("POST /:topic/json without message returns error", async () => {
      const res = await req("/json-error-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "no message" }),
      });
      expect(res.status).toBe(400);
    });
  });
});
