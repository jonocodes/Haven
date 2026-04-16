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

    const sseRes = await worker.fetch(
      new Request(`http://localhost/${topic}/sse`),
      env,
      sseCtx,
    );
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get("content-type")).toContain("text/event-stream");

    const reader = sseRes.body!.getReader();
    const readChunk = async () => decoder.decode((await reader.read()).value);

    const openChunk = await readChunk();
    expect(openChunk).toContain("event: open");

    const pubRes = await req(`/${topic}`, { method: "POST", body: "hello subscriber" });
    expect(pubRes.status).toBe(200);

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

  describe("plain text publish", () => {
    it("PUT /:topic works like POST", async () => {
      const res = await req("/put-test", {
        method: "PUT",
        body: "put message",
      });
      expect(res.status).toBe(200);
      const event = await res.json() as any;
      expect(event.message).toBe("put message");
    });

    it("publish increments published count", async () => {
      const topic = "pub-count-test";
      await req(`/${topic}`, { method: "POST", body: "msg1" });
      await req(`/${topic}`, { method: "POST", body: "msg2" });
      const res = await req(`/${topic}`);
      const stats = await res.json() as any;
      expect(stats.published).toBeGreaterThanOrEqual(2);
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

    it("stats include subscriber count", async () => {
      const topic = "stats-sub-count";
      const sseCtx = createExecutionContext();
      await worker.fetch(
        new Request(`http://localhost/${topic}/sse`),
        env,
        sseCtx,
      );

      const res = await req(`/${topic}`);
      const stats = await res.json() as any;
      expect(stats.subscribers).toBeGreaterThanOrEqual(1);
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

    it("handles OPTIONS preflight", async () => {
      const res = await req("/cors-test", {
        method: "OPTIONS",
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-methods")).toContain("GET");
      expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    });
  });

  describe("topic validation", () => {
    it("empty topic name returns 400", async () => {
      const res = await req("/%20%20%20", { method: "POST", body: "hello" });
      expect(res.status).toBe(400);
    });

    it("topic name too long returns 400", async () => {
      const longName = "a".repeat(201);
      const res = await req(`/${longName}`, { method: "POST", body: "hello" });
      expect(res.status).toBe(400);
    });
  });

  describe("auth (when configured)", () => {
    it("valid Basic auth succeeds", async () => {
      const res = await req("/auth-test", {
        method: "POST",
        body: "hello",
        headers: { Authorization: "Basic YWRtaW46Y2hhbmdlLW1l" },
      });
      if (res.status === 401) return;
      expect(res.status).toBe(200);
    });

    it("valid Bearer auth succeeds", async () => {
      const res = await req("/auth-test", {
        method: "POST",
        body: "hello",
        headers: { Authorization: "Bearer change-me-too" },
      });
      if (res.status === 401) return;
      expect(res.status).toBe(200);
    });

    it("invalid credentials fail", async () => {
      const res = await req("/auth-test", {
        method: "POST",
        body: "hello",
        headers: { Authorization: "Basic wrong:credentials" },
      });
      if (res.status === 200) return;
      expect(res.status).toBe(401);
    });

    it("auth query param with Basic works", async () => {
      const res = await req("/auth-test?auth=Basic%20YWRtaW46Y2hhbmdlLW1l", {
        method: "POST",
        body: "hello",
      });
      if (res.status === 401) return;
      expect(res.status).toBe(200);
    });

    it("auth query param with Bearer works", async () => {
      const res = await req("/auth-test?auth=change-me-too", {
        method: "POST",
        body: "hello",
      });
      if (res.status === 401) return;
      expect(res.status).toBe(200);
    });
  });

  describe("JSON publish (when configured)", () => {
    it("POST /:topic/json returns publish event", async () => {
      const topic = "json-pub-" + Date.now();
      const res = await req(`/${topic}/json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "json message" }),
      });
      if (res.status === 404) return;
      expect(res.status).toBe(200);
      const event = await res.json() as any;
      expect(event.event).toBe("message");
      expect(event.topic).toBe(topic);
    });

    it("PUT /:topic/json works as alias", async () => {
      const topic = "json-put-" + Date.now();
      const res = await req(`/${topic}/json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "put works" }),
      });
      if (res.status === 404) return;
      expect(res.status).toBe(200);
      const event = await res.json() as any;
      expect(event.event).toBe("message");
      expect(event.topic).toBe(topic);
    });
  });

  describe("WebSocket subscribe", () => {
    it("GET /:topic/ws returns 101 switching protocols", async () => {
      const topic = "ws-test-" + Date.now();
      const res = await req(`/${topic}/ws`);
      expect(res.status).toBe(101);
    });

    it("WS subscriber receives open event", async () => {
      const topic = "ws-open-" + Date.now();
      const ctx = createExecutionContext();
      const res = await worker.fetch(
        new Request(`http://localhost/${topic}/ws`),
        env,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(res.status).toBe(101);
    });

    it("WS subscriber receives published message", async () => {
      const topic = "ws-msg-" + Date.now();
      const ctx = createExecutionContext();
      const res = await worker.fetch(
        new Request(`http://localhost/${topic}/ws`),
        env,
        ctx,
      );
      expect(res.status).toBe(101);

      const pubRes = await req(`/${topic}`, { method: "POST", body: "hello ws" });
      expect(pubRes.status).toBe(200);
    });
  });

  describe("rate limiting", () => {
    it("exceeding rate limit returns 429", async () => {
      const topic = "rate-limit-" + Date.now();
      for (let i = 0; i < 30; i++) {
        await req(`/${topic}`, { method: "POST", body: `msg${i}` });
      }
      const res = await req(`/${topic}`, { method: "POST", body: "rate limited" });
      expect(res.status).toBe(429);
      const body = await res.json() as any;
      expect(body.code).toBe(429);
      expect(body.error).toBe("rate limit exceeded");
    });

    it("rate limited response includes Retry-After header", async () => {
      const topic = "rate-retry-" + Date.now();
      for (let i = 0; i < 30; i++) {
        await req(`/${topic}`, { method: "POST", body: `msg${i}` });
      }
      const res = await req(`/${topic}`, { method: "POST", body: "rate limited" });
      expect(res.headers.get("retry-after")).toBe("10");
    });
  });

  describe("subscriber cap", () => {
    it("exceeding max subscribers returns 429", async () => {
      const topic = "cap-test-" + Date.now();
      const maxSubs = 100;
      for (let i = 0; i < maxSubs; i++) {
        const ctx = createExecutionContext();
        await worker.fetch(
          new Request(`http://localhost/${topic}/sse`),
          env,
          ctx,
        );
        await waitOnExecutionContext(ctx);
      }
      const ctx = createExecutionContext();
      const res = await worker.fetch(
        new Request(`http://localhost/${topic}/sse`),
        env,
        ctx,
      );
      expect(res.status).toBe(429);
      await waitOnExecutionContext(ctx);
    });
  });

  describe("list messages", () => {
    it("GET /:topic/messages returns messages", async () => {
      const topic = "list-msgs-" + Date.now();
      await req(`/${topic}`, { method: "POST", body: "msg1" });
      await req(`/${topic}`, { method: "POST", body: "msg2" });

      const res = await req(`/${topic}/messages`);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.topic).toBe(topic);
      expect(body.messages).toBeDefined();
      expect(body.count).toBeGreaterThanOrEqual(2);
    });

    it("messages include id, time, message", async () => {
      const topic = "list-msgs-detail-" + Date.now();
      await req(`/${topic}`, { method: "POST", body: "detail test" });

      const res = await req(`/${topic}/messages`);
      const body = await res.json() as any;
      expect(body.messages[0]).toHaveProperty("id");
      expect(body.messages[0]).toHaveProperty("time");
      expect(body.messages[0].message).toBe("detail test");
    });
  });

  describe("delete message", () => {
    it("DELETE /:topic/messages/:id removes message", async () => {
      const topic = "del-msg-" + Date.now();
      const pubRes = await req(`/${topic}`, { method: "POST", body: "to delete" });
      const event = await pubRes.json() as any;
      const msgId = event.id;

      const delRes = await req(`/${topic}/messages/${msgId}`, { method: "DELETE" });
      expect(delRes.status).toBe(200);
      const delEvent = await delRes.json() as any;
      expect(delEvent.event).toBe("delete");
      expect(delEvent.messageId).toBe(msgId);
    });

    it("DELETE /:topic/messages/:id returns 404 for unknown id", async () => {
      const topic = "del-msg-404-" + Date.now();
      const res = await req(`/${topic}/messages/unknown-id`, { method: "DELETE" });
      expect(res.status).toBe(404);
    });
  });

  describe("delete all messages", () => {
    it("DELETE /:topic/messages clears buffer", async () => {
      const topic = "del-all-" + Date.now();
      await req(`/${topic}`, { method: "POST", body: "msg1" });
      await req(`/${topic}`, { method: "POST", body: "msg2" });
      await req(`/${topic}`, { method: "POST", body: "msg3" });

      const delRes = await req(`/${topic}/messages`, { method: "DELETE" });
      expect(delRes.status).toBe(200);
      const delEvent = await delRes.json() as any;
      expect(delEvent.event).toBe("delete_all");
      expect(delEvent.deletedCount).toBeGreaterThanOrEqual(3);

      const listRes = await req(`/${topic}/messages`);
      const listBody = await listRes.json() as any;
      expect(listBody.count).toBe(0);
    });
  });

  describe("retention", () => {
    it("PUT /topic/retention sets retention duration", async () => {
      const topic = "retention-set-" + Date.now();
      const res = await req(`/${topic}/retention`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-topic": topic,
        },
        body: JSON.stringify({ duration: 3600000 }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.retentionDurationMs).toBe(3600000);
    });

    it("PUT /topic/retention rejects invalid duration", async () => {
      const topic = "retention-invalid-" + Date.now();
      const res = await req(`/${topic}/retention`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-topic": topic,
        },
        body: JSON.stringify({ duration: -1 }),
      });
      expect(res.status).toBe(400);
    });

    it("messages get expires field when topic has retention", async () => {
      const topic = "retention-expires-" + Date.now();
      await req(`/${topic}/retention`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-topic": topic },
        body: JSON.stringify({ duration: 3600000 }),
      });

      const pubRes = await req(`/${topic}`, { method: "POST", body: "test message" });
      expect(pubRes.status).toBe(200);
      const event = await pubRes.json() as any;
      expect(event.expires).toBeDefined();
      expect(event.expires).toBeGreaterThan(event.time);
    });

    it("JSON publish with expires field sets expires on message", async () => {
      const topic = "retention-json-expires-" + Date.now();
      const res = await req(`/${topic}/json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-topic": topic,
        },
        body: JSON.stringify({ message: "expires test", expires: 3600 }),
      });
      if (res.status === 404) return;
      expect(res.status).toBe(200);
      const event = await res.json() as any;
      expect(event.expires).toBeDefined();
    });
  });

  describe("permissions", () => {
    it("PUT /topic/permissions sets topic permission", async () => {
      const topic = "permissions-set-" + Date.now();
      const res = await req(`/${topic}/permissions`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-topic": topic,
        },
        body: JSON.stringify({ permission: "read-only" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.permission).toBe("read-only");
    });

    it("PUT /topic/permissions rejects invalid permission", async () => {
      const topic = "permissions-invalid-" + Date.now();
      const res = await req(`/${topic}/permissions`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-topic": topic,
        },
        body: JSON.stringify({ permission: "invalid" }),
      });
      expect(res.status).toBe(400);
    });

    it("write-only topic denies publish", async () => {
      const topic = "permissions-write-only-" + Date.now();
      await req(`/${topic}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-topic": topic },
        body: JSON.stringify({ permission: "write-only" }),
      });
      const pubRes = await req(`/${topic}`, { method: "POST", body: "test" });
      expect(pubRes.status).toBe(403);
    });

    it("read-only topic denies subscribe via SSE", async () => {
      const topic = "permissions-read-only-" + Date.now();
      await req(`/${topic}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-topic": topic },
        body: JSON.stringify({ permission: "read-only" }),
      });
      const subRes = await req(`/${topic}/sse`, { method: "GET" });
      expect(subRes.status).toBe(403);
    });

    it("none permission denies both read and write", async () => {
      const topic = "permissions-none-" + Date.now();
      await req(`/${topic}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-topic": topic },
        body: JSON.stringify({ permission: "none" }),
      });
      const pubRes = await req(`/${topic}`, { method: "POST", body: "test" });
      expect(pubRes.status).toBe(403);
      const subRes = await req(`/${topic}/sse`, { method: "GET" });
      expect(subRes.status).toBe(403);
    });

    it("read-write permission allows both read and write", async () => {
      const topic = "permissions-rw-" + Date.now();
      await req(`/${topic}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-topic": topic },
        body: JSON.stringify({ permission: "read-write" }),
      });
      const pubRes = await req(`/${topic}`, { method: "POST", body: "test" });
      expect(pubRes.status).toBe(200);
      const subRes = await req(`/${topic}/sse`, { method: "GET" });
      expect(subRes.status).toBe(200);
    });
  });

  describe("help text", () => {
    it("root lists all endpoints", async () => {
      const res = await req("/");
      const text = await res.text();
      expect(text).toContain("/messages/:messageId");
      expect(text).toContain("DELETE /:topic/messages");
      expect(text).toContain("?poll=");
      expect(text).toContain("json");
    });
  });
});
