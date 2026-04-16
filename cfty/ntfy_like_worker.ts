import { DurableObject } from "cloudflare:workers";

// cfty — Cloudflare-based tiny ntfy-like service
//
// Supported endpoints:
//   POST /:topic     Publish a plain-text message body to a topic
//   PUT  /:topic     Same as POST
//   GET  /:topic     Return lightweight stats for a topic
//   GET  /:topic/sse Subscribe to live SSE events for a topic
//   GET  /:topic/ws  Subscribe via WebSocket (ntfy web client compatible)
//   GET  /:topic/auth Check topic authorization
//   POST /:topic/json Publish a JSON-formatted message body to a topic
//
// Notes:
// - Live-only: no persistence, no replay/history, no filtering
// - Optional global Basic or Bearer auth
// - Intended for use as a drop-in replacement for simple ntfy post + sse use cases

export interface Env {
  TOPIC_HUB: DurableObjectNamespace<TopicHub>;
  MAX_SUBSCRIBERS_PER_TOPIC?: string;
  CACHE_DURATION_MS?: string;
  AUTH_ENABLED?: string;
  BASIC_AUTH_USER?: string;
  BASIC_AUTH_PASS?: string;
  BEARER_AUTH_TOKEN?: string;
}

type PublishEvent = {
  id: string;
  time: number; // Unix timestamp, seconds
  event: "message";
  topic: string;
  message: string;
  title?: string;
  priority?: number;
  tags?: string[];
  click?: string;
  expires?: number; // Unix timestamp, seconds, when message should be deleted
};

type JsonPublishBody = {
  message: string;
  title?: string;
  priority?: number;
  tags?: string[];
  click?: string;
  expires?: number; // Unix timestamp or relative seconds
};

type OpenEvent = {
  id: string;
  time: number;
  event: "open";
  topic: string;
};

type KeepaliveEvent = {
  id: string;
  time: number;
  event: "keepalive";
  topic: string;
};

type DeleteEvent = {
  id: string;
  time: number;
  event: "delete";
  topic: string;
  messageId: string;
};

type DeleteAllEvent = {
  id: string;
  time: number;
  event: "delete_all";
  topic: string;
};

type TopicStats = {
  topic: string;
  subscribers: number;
  published: number;
  maxSubscribers: number;
  rateLimit: {
    windowMs: number;
    maxPublishes: number;
    recentPublishes: number;
  };
};

type SseSubscriber = {
  kind: "sse";
  writer: WritableStreamDefaultWriter<Uint8Array>;
  keepalive?: ReturnType<typeof setInterval>;
  lastEventId?: string;
};

type WsSubscriber = {
  kind: "ws";
  socket: WebSocket;
  keepalive?: ReturnType<typeof setInterval>;
};

type Subscriber = SseSubscriber | WsSubscriber;

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

function text(data: string, init?: ResponseInit): Response {
  return new Response(data, {
    ...init,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

function unauthorized(): Response {
  return new Response("unauthorized", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="cfty"',
      "access-control-allow-origin": "*",
    },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function hasAuthConfigured(env: Env): boolean {
  const authEnabled = env.AUTH_ENABLED?.trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(authEnabled || "")) {
    return false;
  }

  const hasCredentials = Boolean((env.BASIC_AUTH_USER && env.BASIC_AUTH_PASS) || env.BEARER_AUTH_TOKEN);
  if (!hasCredentials) return false;

  return true;
}

function isAuthorized(request: Request, env: Env): boolean {
    const url = new URL(request.url);
    const authHeader = request.headers.get("authorization");
    const authParam = url.searchParams.get("auth");

    if (authHeader) {
      if (authHeader.startsWith("Basic ")) {
        if (!env.BASIC_AUTH_USER || !env.BASIC_AUTH_PASS) return false;

        let decoded = "";
        try {
          decoded = atob(authHeader.slice("Basic ".length));
        } catch {
          return false;
        }

        const idx = decoded.indexOf(":");
        if (idx < 0) return false;

        const user = decoded.slice(0, idx);
        const pass = decoded.slice(idx + 1);

        return timingSafeEqual(user, env.BASIC_AUTH_USER) && timingSafeEqual(pass, env.BASIC_AUTH_PASS);
      }

      if (authHeader.startsWith("Bearer ")) {
        if (!env.BEARER_AUTH_TOKEN) return false;
        const token = authHeader.slice("Bearer ".length);
        return timingSafeEqual(token, env.BEARER_AUTH_TOKEN);
      }

      return false;
    }

    if (authParam) {
      if (authParam.startsWith("Basic ")) {
        if (!env.BASIC_AUTH_USER || !env.BASIC_AUTH_PASS) return false;

        let decoded = "";
        try {
          decoded = atob(authParam.slice("Basic ".length));
        } catch {
          return false;
        }

        const idx = decoded.indexOf(":");
        if (idx < 0) return false;

        const user = decoded.slice(0, idx);
        const pass = decoded.slice(idx + 1);

        return timingSafeEqual(user, env.BASIC_AUTH_USER) && timingSafeEqual(pass, env.BASIC_AUTH_PASS);
      }

      if (env.BEARER_AUTH_TOKEN) {
        return timingSafeEqual(authParam, env.BEARER_AUTH_TOKEN);
      }

      return false;
    }

    return false;
  }

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

function makeId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function parseTopicFromPath(
  pathname: string,
): { topic: string; isSse: boolean; isWs: boolean; isAuth: boolean; isJson: boolean; isMessages?: boolean; messageId?: string; isDeleteAll?: boolean; isRetention?: boolean; isPermissions?: boolean } | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 1) {
    return { topic: parts[0], isSse: false, isWs: false, isAuth: false, isJson: false };
  }
  if (parts.length === 2 && parts[1] === "sse") {
    return { topic: parts[0], isSse: true, isWs: false, isAuth: false, isJson: false };
  }
  if (parts.length === 2 && parts[1] === "ws") {
    return { topic: parts[0], isSse: false, isWs: true, isAuth: false, isJson: false };
  }
  if (parts.length === 2 && parts[1] === "auth") {
    return { topic: parts[0], isSse: false, isWs: false, isAuth: true, isJson: false };
  }
  if (parts.length === 2 && parts[1] === "json") {
    return { topic: parts[0], isSse: false, isWs: false, isAuth: false, isJson: true };
  }
  if (parts.length === 2 && parts[1] === "messages") {
    return { topic: parts[0], isSse: false, isWs: false, isAuth: false, isJson: false, isMessages: true, isDeleteAll: true };
  }
  if (parts.length === 3 && parts[1] === "messages") {
    return { topic: parts[0], isSse: false, isWs: false, isAuth: false, isJson: false, messageId: parts[2] };
  }
  if (parts.length === 2 && parts[1] === "retention") {
    return { topic: parts[0], isSse: false, isWs: false, isAuth: false, isJson: false, isRetention: true };
  }
  if (parts.length === 2 && parts[1] === "permissions") {
    return { topic: parts[0], isSse: false, isWs: false, isAuth: false, isJson: false, isPermissions: true };
  }
  return null;
}

function sanitizeTopic(topic: string): string {
  let t: string;
  try {
    t = decodeURIComponent(topic).trim();
  } catch {
    t = topic.trim();
  }
  if (!t) throw new Error("invalid topic");
  if (t.length > 200) throw new Error("topic too long");
  return t;
}

function parseTitle(headers: Headers): string | undefined {
  const raw = headers.get("Title") || headers.get("X-Title") || headers.get("title");
  const title = raw?.trim();
  return title ? title.slice(0, 256) : undefined;
}

function toSseFrame(eventName: string, payload: unknown, id?: string): string {
  const lines: string[] = [];
  if (id) lines.push(`id: ${id}`);
  lines.push(`event: ${eventName}`);
  const body = JSON.stringify(payload);
  for (const line of body.split("\n")) {
    lines.push(`data: ${line}`);
  }
  lines.push("", "");
  return lines.join("\n");
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type, Title, X-Title",
};

function withCors(response: Response): Response {
  const res = new Response(response.body, response);
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (hasAuthConfigured(env) && !isAuthorized(request, env)) {
      return withCors(unauthorized());
    }

    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      return withCors(
        text(
          [
            "cfty — Cloudflare-based tiny ntfy-like service",
            "",
            "Endpoints:",
            "  POST /:topic",
            "  PUT  /:topic",
            "  GET  /:topic",
            "  GET  /:topic?poll=<seconds>",
            "  GET  /:topic/messages",
            "  GET  /:topic/sse",
            "  POST /:topic/json",
            "  PUT  /:topic/json",
            "  GET  /:topic/auth",
            "  DELETE /:topic/messages/:messageId",
            "  DELETE /:topic/messages",
          ].join("\n"),
        ),
      );
    }

    const parsed = parseTopicFromPath(url.pathname);
    if (!parsed) {
      return withCors(json({ code: 404, error: "not found" }, { status: 404 }));
    }

    let topic: string;
    try {
      topic = sanitizeTopic(parsed.topic);
    } catch (err) {
      return withCors(json({ code: 400, error: (err as Error).message }, { status: 400 }));
    }

    const id = env.TOPIC_HUB.idFromName(topic);
    const stub = env.TOPIC_HUB.get(id);

    if (parsed.isAuth && request.method === "GET") {
      return withCors(json({ success: true }));
    }

    if (parsed.isSse && request.method === "GET") {
      const lastEventId = request.headers.get("Last-Event-ID") || url.searchParams.get("since") || undefined;
      return withCors(
        await stub.fetch("https://hub.internal/subscribe", {
          method: "GET",
          headers: {
            "x-topic": topic,
            "cf-connecting-ip": request.headers.get("cf-connecting-ip") || "",
            "user-agent": request.headers.get("user-agent") || "",
            ...(lastEventId ? { "x-last-event-id": lastEventId } : {}),
          },
        }),
      );
    }

    if (parsed.isWs && request.method === "GET") {
      // Forward the WebSocket upgrade to the DO — do not apply CORS to 101 responses
      return stub.fetch("https://hub.internal/subscribe-ws", {
        method: "GET",
        headers: {
          "x-topic": topic,
          upgrade: "websocket",
          "cf-connecting-ip": request.headers.get("cf-connecting-ip") || "",
          "user-agent": request.headers.get("user-agent") || "",
        },
      });
    }

    if (parsed.isMessages && request.method === "GET") {
      return withCors(
        await stub.fetch("https://hub.internal/messages", {
          method: "GET",
          headers: {
            "x-topic": topic,
          },
        }),
      );
    }

    if (!parsed.isSse && !parsed.isWs && request.method === "GET") {
      const pollParam = url.searchParams.get("poll");
      if (pollParam) {
        return withCors(
          await stub.fetch("https://hub.internal/poll", {
            method: "GET",
            headers: {
              "x-topic": topic,
              "x-poll": pollParam,
              "cf-connecting-ip": request.headers.get("cf-connecting-ip") || "",
              "user-agent": request.headers.get("user-agent") || "",
            },
          }),
        );
      }
      return withCors(
        await stub.fetch("https://hub.internal/stats", {
          method: "GET",
          headers: {
            "x-topic": topic,
          },
        }),
      );
    }

    if (parsed.isRetention && request.method === "PUT") {
      const rawBody = await request.text();
      return withCors(
        await stub.fetch("https://hub.internal/retention", {
          method: "PUT",
          headers: {
            "content-type": "text/plain",
            "x-topic": topic,
          },
          body: rawBody,
        }),
      );
    }

    if (parsed.isPermissions && request.method === "PUT") {
      const rawBody = await request.text();
      return withCors(
        await stub.fetch("https://hub.internal/permissions", {
          method: "PUT",
          headers: {
            "content-type": "text/plain",
            "x-topic": topic,
          },
          body: rawBody,
        }),
      );
    }

    if (parsed.isJson && (request.method === "POST" || request.method === "PUT")) {
      const rawBody = await request.text();
      return withCors(
        await stub.fetch("https://hub.internal/publish-json", {
          method: "POST",
          headers: {
            "content-type": "text/plain",
            "x-topic": topic,
            "cf-connecting-ip": request.headers.get("cf-connecting-ip") || "",
            "user-agent": request.headers.get("user-agent") || "",
          },
          body: rawBody,
        }),
      );
    }

    if (!parsed.isSse && !parsed.isWs && (request.method === "POST" || request.method === "PUT")) {
      const message = await request.text();
      const payload = {
        topic,
        message,
        title: parseTitle(request.headers),
      };
      return withCors(
        await stub.fetch("https://hub.internal/publish", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-topic": topic,
            "cf-connecting-ip": request.headers.get("cf-connecting-ip") || "",
            "user-agent": request.headers.get("user-agent") || "",
          },
          body: JSON.stringify(payload),
        }),
      );
    }

    if (parsed.messageId && request.method === "DELETE") {
      return withCors(
        await stub.fetch("https://hub.internal/delete-message", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-topic": topic,
            "x-message-id": parsed.messageId,
            "cf-connecting-ip": request.headers.get("cf-connecting-ip") || "",
            "user-agent": request.headers.get("user-agent") || "",
          },
          body: JSON.stringify({ messageId: parsed.messageId }),
        }),
      );
    }

    if (parsed.isDeleteAll && request.method === "DELETE") {
      return withCors(
        await stub.fetch("https://hub.internal/delete-all-messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-topic": topic,
            "cf-connecting-ip": request.headers.get("cf-connecting-ip") || "",
            "user-agent": request.headers.get("user-agent") || "",
          },
          body: JSON.stringify({}),
        }),
      );
    }

    return withCors(json({ code: 405, error: "method not allowed" }, { status: 405 }));
  },
};

export class TopicHub extends DurableObject<Env> {
  private publishedCount = 0;
  private readonly rateLimitWindowMs = 10_000;
  private readonly maxPublishesPerWindow = 30;
  private recentPublishTimestamps: number[] = [];
  private subscribers = new Map<string, Subscriber>();
  private readonly replayBufferSize = 100;
  private replayBuffer: PublishEvent[] = [];
  private topicRetentionMs: number | null = null;
  private topicPermission: "read-write" | "read-only" | "write-only" | "none" = "read-write";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private maxSubscribersPerTopic(): number {
    const raw = this.env.MAX_SUBSCRIBERS_PER_TOPIC;
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed);
    }
    return 100;
  }

  private cacheDurationMs(): number {
    const raw = this.env.CACHE_DURATION_MS;
    if (!raw) return 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.trunc(parsed);
  }

  private retentionDurationMs(): number {
    if (this.topicRetentionMs !== null) {
      return this.topicRetentionMs;
    }
    const raw = this.env.RETENTION_DURATION_MS;
    if (!raw) return 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.trunc(parsed);
  }

  private computeExpiresFromBody(expiresValue: number | undefined): number | undefined {
    if (expiresValue === undefined) {
      const retention = this.retentionDurationMs();
      if (retention <= 0) return undefined;
      return unixNow() + Math.floor(retention / 1000);
    }
    if (expiresValue < 1e9) {
      return unixNow() + Math.floor(expiresValue);
    }
    if (expiresValue < 1e12) {
      return Math.floor(expiresValue);
    }
    return Math.floor(expiresValue / 1000);
  }

  private pruneByTime(nowMs: number): number {
    const nowSec = Math.floor(nowMs / 1000);
    const before = this.replayBuffer.length;
    this.replayBuffer = this.replayBuffer.filter((e) => {
      if (e.expires && e.expires <= nowSec) return false;
      const retention = this.retentionDurationMs();
      if (retention > 0) {
        const cutoff = nowSec - Math.floor(retention / 1000);
        if (e.time < cutoff) return false;
      }
      return true;
    });
    return before - this.replayBuffer.length;
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/stats" && request.method === "GET") {
      return this.handleStats(request);
    }

    if (url.pathname === "/subscribe") {
      return this.handleSubscribe(request);
    }

    if (url.pathname === "/subscribe-ws") {
      return this.handleSubscribeWs(request);
    }

    if (url.pathname === "/publish" && request.method === "POST") {
      return this.handlePublish(request);
    }

    if (url.pathname === "/publish-json" && request.method === "POST") {
      return this.handlePublishJson(request);
    }

    if (url.pathname === "/delete-message" && request.method === "POST") {
      return this.handleDeleteMessage(request);
    }

    if (url.pathname === "/delete-all-messages" && request.method === "POST") {
      return this.handleDeleteAllMessages(request);
    }

    if (url.pathname === "/messages" && request.method === "GET") {
      return this.handleMessages(request);
    }

    if (url.pathname === "/poll" && request.method === "GET") {
      return this.handlePoll(request);
    }

    if (url.pathname === "/retention" && request.method === "PUT") {
      return this.handleRetention(request);
    }

    if (url.pathname === "/permissions" && request.method === "PUT") {
      return this.handlePermissions(request);
    }

    return json({ code: 404, error: "not found" }, { status: 404 });
  }

  private async handleSubscribe(request: Request): Promise<Response> {
    const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const topic = request.headers.get("x-topic") || this.ctx.id.toString();
    const lastEventId = request.headers.get("x-last-event-id") || undefined;
    const sinceParam = request.headers.get("x-since-param") || undefined;
    const maxSubscribers = this.maxSubscribersPerTopic();

    if (this.topicPermission === "read-only" || this.topicPermission === "none") {
      return json({ code: 403, error: "read access denied" }, { status: 403 });
    }

    if (this.subscribers.size >= maxSubscribers) {
      console.log(
        JSON.stringify({
          event: "sse_subscribe_rejected",
          reason: "max_subscribers",
          topic,
          subscribers: this.subscribers.size,
          maxSubscribers,
          clientIp,
          userAgent,
        }),
      );

      return json(
        {
          code: 429,
          error: "too many subscribers",
          topic,
          subscribers: this.subscribers.size,
          maxSubscribers,
        },
        { status: 429 },
      );
    }

    const subscriberId = makeId();
    const encoder = new TextEncoder();

    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();

    this.subscribers.set(subscriberId, { kind: "sse", writer });

    console.log(
      JSON.stringify({
        event: "sse_subscribe",
        topic,
        subscriberId,
        subscribers: this.subscribers.size,
        clientIp,
        userAgent,
      }),
    );

    const cleanup = async () => {
      const entry = this.subscribers.get(subscriberId);
      if (!entry || entry.kind !== "sse") return;
      if (entry.keepalive) clearInterval(entry.keepalive);
      this.subscribers.delete(subscriberId);
      try {
        await entry.writer.close();
      } catch {
        // Ignore already-closed streams.
      }
    };

    const openEvent: OpenEvent = {
      id: makeId(),
      time: unixNow(),
      event: "open",
      topic,
    };

    // Do not await — returning the Response must happen first so the edge
    // starts consuming the readable; awaiting here deadlocks on production
    // because TransformStream's readable HWM is 0 (writes block until read).
    void writer.write(encoder.encode(toSseFrame("open", openEvent, openEvent.id)));

    const keepalive = setInterval(async () => {
      const event: KeepaliveEvent = {
        id: makeId(),
        time: unixNow(),
        event: "keepalive",
        topic,
      };
      try {
        await writer.write(encoder.encode(toSseFrame("keepalive", event, event.id)));
      } catch {
        clearInterval(keepalive);
        this.subscribers.delete(subscriberId);
      }
    }, 25000);

    const entry = this.subscribers.get(subscriberId);
    if (entry) entry.keepalive = keepalive;

    request.signal.addEventListener("abort", () => {
      console.log(
        JSON.stringify({
          event: "sse_abort",
          topic,
          subscriberId,
          subscribers: Math.max(0, this.subscribers.size - 1),
          clientIp,
        }),
      );
      void cleanup();
    });

    if (lastEventId || sinceParam) {
      this.pruneByTime(Date.now());
      const sinceTime = this.resolveSinceTime(lastEventId, sinceParam);
      const missedEvents = this.getReplayEvents(sinceTime);
      for (const event of missedEvents) {
        try {
          await writer.write(encoder.encode(toSseFrame("message", event, event.id)));
        } catch {
          break;
        }
      }
    }

    return new Response(stream.readable, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-store, must-revalidate",
        "connection": "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  }

  private handleSubscribeWs(request: Request): Response {
    const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const topic = request.headers.get("x-topic") || this.ctx.id.toString();
    const maxSubscribers = this.maxSubscribersPerTopic();

    if (this.subscribers.size >= maxSubscribers) {
      console.log(
        JSON.stringify({
          event: "ws_subscribe_rejected",
          reason: "max_subscribers",
          topic,
          subscribers: this.subscribers.size,
          maxSubscribers,
          clientIp,
          userAgent,
        }),
      );

      return json(
        {
          code: 429,
          error: "too many subscribers",
          topic,
          subscribers: this.subscribers.size,
          maxSubscribers,
        },
        { status: 429 },
      );
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const subscriberId = makeId();
    this.subscribers.set(subscriberId, { kind: "ws", socket: server });

    console.log(
      JSON.stringify({
        event: "ws_subscribe",
        topic,
        subscriberId,
        subscribers: this.subscribers.size,
        clientIp,
        userAgent,
      }),
    );

    const cleanup = () => {
      const entry = this.subscribers.get(subscriberId);
      if (!entry || entry.kind !== "ws") return;
      if (entry.keepalive) clearInterval(entry.keepalive);
      this.subscribers.delete(subscriberId);
      try {
        entry.socket.close();
      } catch {
        // Ignore already-closed sockets.
      }
    };

    const openEvent: OpenEvent = { id: makeId(), time: unixNow(), event: "open", topic };
    server.send(JSON.stringify(openEvent));

    const keepalive = setInterval(() => {
      const event: KeepaliveEvent = { id: makeId(), time: unixNow(), event: "keepalive", topic };
      try {
        server.send(JSON.stringify(event));
      } catch {
        clearInterval(keepalive);
        this.subscribers.delete(subscriberId);
      }
    }, 25000);

    const entry = this.subscribers.get(subscriberId);
    if (entry) entry.keepalive = keepalive;

    server.addEventListener("close", () => {
      console.log(
        JSON.stringify({
          event: "ws_close",
          topic,
          subscriberId,
          subscribers: Math.max(0, this.subscribers.size - 1),
          clientIp,
        }),
      );
      cleanup();
    });

    server.addEventListener("error", () => cleanup());

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleStats(request: Request): Response {
    const topic = request.headers.get("x-topic") || this.ctx.id.toString();
    this.pruneRecentPublishes(Date.now());
    this.pruneByTime(Date.now());

    const stats: TopicStats = {
      topic,
      subscribers: this.subscribers.size,
      published: this.publishedCount,
      maxSubscribers: this.maxSubscribersPerTopic(),
      rateLimit: {
        windowMs: this.rateLimitWindowMs,
        maxPublishes: this.maxPublishesPerWindow,
        recentPublishes: this.recentPublishTimestamps.length,
      },
    };

    return json(stats, { status: 200 });
  }

  private async handlePublish(request: Request): Promise<Response> {
    const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const topic = request.headers.get("x-topic") || this.ctx.id.toString();

    if (this.topicPermission === "write-only" || this.topicPermission === "none") {
      return json({ code: 403, error: "write access denied" }, { status: 403 });
    }

    const nowMs = Date.now();
    this.pruneRecentPublishes(nowMs);
    if (this.recentPublishTimestamps.length >= this.maxPublishesPerWindow) {
      console.log(
        JSON.stringify({
          event: "publish_rate_limited",
          topic,
          clientIp,
          userAgent,
          windowMs: this.rateLimitWindowMs,
          maxPublishes: this.maxPublishesPerWindow,
        }),
      );

      return json(
        {
          code: 429,
          error: "rate limit exceeded",
          windowMs: this.rateLimitWindowMs,
          maxPublishes: this.maxPublishesPerWindow,
        },
        {
          status: 429,
          headers: {
            "retry-after": String(Math.ceil(this.rateLimitWindowMs / 1000)),
          },
        },
      );
    }
    this.recentPublishTimestamps.push(nowMs);

    const rawBody = await request.text();
    let body: {
      topic: string;
      message: string;
      title?: string;
      expires?: number;
    };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ code: 400, error: "invalid JSON" }, { status: 400 });
    }

    if (!body.message) {
      return json({ code: 400, error: "message is required" }, { status: 400 });
    }

    const event: PublishEvent = {
      id: makeId(),
      time: unixNow(),
      event: "message",
      topic: body.topic || topic,
      message: body.message,
      ...(body.title ? { title: body.title } : {}),
      ...(this.computeExpiresFromBody(body.expires) !== undefined
        ? { expires: this.computeExpiresFromBody(body.expires) } : {}),
    };

    const sseFrame = new TextEncoder().encode(toSseFrame("message", event, event.id));
    const wsFrame = JSON.stringify(event);
    this.publishedCount += 1;
    this.addToReplayBuffer(event);

    const dead: string[] = [];
    await Promise.all(
      [...this.subscribers.entries()].map(async ([id, sub]) => {
        try {
          if (sub.kind === "sse") {
            await sub.writer.write(sseFrame);
          } else {
            sub.socket.send(wsFrame);
          }
        } catch {
          if (sub.keepalive) clearInterval(sub.keepalive);
          dead.push(id);
        }
      }),
    );

    for (const id of dead) {
      this.subscribers.delete(id);
    }

    console.log(
      JSON.stringify({
        event: "publish",
        topic: event.topic,
        messageId: event.id,
        subscribers: this.subscribers.size,
        deadSubscribers: dead.length,
        clientIp,
        userAgent,
        publishedCount: this.publishedCount,
      }),
    );

    return json(event, { status: 200 });
  }

  private async handlePublishJson(request: Request): Promise<Response> {
    const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const topic = request.headers.get("x-topic") || this.ctx.id.toString();

    const nowMs = Date.now();
    this.pruneRecentPublishes(nowMs);
    if (this.recentPublishTimestamps.length >= this.maxPublishesPerWindow) {
      console.log(
        JSON.stringify({
          event: "publish_rate_limited",
          topic,
          clientIp,
          userAgent,
          windowMs: this.rateLimitWindowMs,
          maxPublishes: this.maxPublishesPerWindow,
        }),
      );

      return json(
        {
          code: 429,
          error: "rate limit exceeded",
          windowMs: this.rateLimitWindowMs,
          maxPublishes: this.maxPublishesPerWindow,
        },
        {
          status: 429,
          headers: {
            "retry-after": String(Math.ceil(this.rateLimitWindowMs / 1000)),
          },
        },
      );
    }
    this.recentPublishTimestamps.push(nowMs);

    const rawBody = await request.text();
    let body: JsonPublishBody;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ code: 400, error: "invalid JSON" }, { status: 400 });
    }

    if (!body.message) {
      return json({ code: 400, error: "message is required" }, { status: 400 });
    }

    const computedExpires = this.computeExpiresFromBody(body.expires);

    const event: PublishEvent = {
      id: makeId(),
      time: unixNow(),
      event: "message",
      topic,
      message: body.message,
      ...(body.title ? { title: body.title } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.tags ? { tags: body.tags } : {}),
      ...(body.click ? { click: body.click } : {}),
      ...(computedExpires !== undefined ? { expires: computedExpires } : {}),
    };

    const sseFrame = new TextEncoder().encode(toSseFrame("message", event, event.id));
    const wsFrame = JSON.stringify(event);
    this.publishedCount += 1;
    this.addToReplayBuffer(event);

    const dead: string[] = [];
    await Promise.all(
      [...this.subscribers.entries()].map(async ([id, sub]) => {
        try {
          if (sub.kind === "sse") {
            await sub.writer.write(sseFrame);
          } else {
            sub.socket.send(wsFrame);
          }
        } catch {
          if (sub.keepalive) clearInterval(sub.keepalive);
          dead.push(id);
        }
      }),
    );

    for (const id of dead) {
      this.subscribers.delete(id);
    }

    console.log(
      JSON.stringify({
        event: "publish",
        topic: event.topic,
        messageId: event.id,
        subscribers: this.subscribers.size,
        deadSubscribers: dead.length,
        clientIp,
        userAgent,
        publishedCount: this.publishedCount,
      }),
    );

    return json(event, { status: 200 });
  }

  private addToReplayBuffer(event: PublishEvent): void {
    this.replayBuffer.push(event);
    if (this.replayBuffer.length > this.replayBufferSize) {
      this.replayBuffer.shift();
    }
  }

  private getReplayEvents(sinceTime: number): PublishEvent[] {
    return this.replayBuffer.filter((e) => e.time > sinceTime);
  }

  private resolveSinceTime(lastEventId?: string, sinceParam?: string): number {
    if (lastEventId) {
      const byId = this.replayBuffer.find((e) => e.id === lastEventId);
      if (byId) return byId.time;
    }
    if (sinceParam) {
      const sinceNum = Number(sinceParam);
      if (Number.isFinite(sinceNum)) {
        if (sinceParam.length === 10) {
          return sinceNum;
        }
        if (sinceParam.length === 13) {
          return Math.floor(sinceNum / 1000);
        }
        return sinceNum;
      }
    }
    return 0;
  }

  private async handleDeleteMessage(request: Request): Promise<Response> {
    const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const topic = request.headers.get("x-topic") || this.ctx.id.toString();
    const messageId = request.headers.get("x-message-id") || "";

    if (!messageId) {
      return json({ code: 400, error: "messageId is required" }, { status: 400 });
    }

    const messageIndex = this.replayBuffer.findIndex((e) => e.id === messageId);
    if (messageIndex === -1) {
      return json({ code: 404, error: "message not found" }, { status: 404 });
    }

    this.replayBuffer.splice(messageIndex, 1);

    const deleteEvent: DeleteEvent = {
      id: makeId(),
      time: unixNow(),
      event: "delete",
      topic,
      messageId,
    };

    const sseFrame = new TextEncoder().encode(toSseFrame("delete", deleteEvent, deleteEvent.id));
    const wsFrame = JSON.stringify(deleteEvent);

    const dead: string[] = [];
    await Promise.all(
      [...this.subscribers.entries()].map(async ([id, sub]) => {
        try {
          if (sub.kind === "sse") {
            await sub.writer.write(sseFrame);
          } else {
            sub.socket.send(wsFrame);
          }
        } catch {
          if (sub.keepalive) clearInterval(sub.keepalive);
          dead.push(id);
        }
      }),
    );

    for (const id of dead) {
      this.subscribers.delete(id);
    }

    console.log(
      JSON.stringify({
        event: "delete",
        topic,
        messageId,
        subscribers: this.subscribers.size,
        deadSubscribers: dead.length,
        clientIp,
        userAgent,
      }),
    );

    return json(deleteEvent, { status: 200 });
  }

  private async handleDeleteAllMessages(request: Request): Promise<Response> {
    const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const topic = request.headers.get("x-topic") || this.ctx.id.toString();

    const deletedCount = this.replayBuffer.length;
    this.replayBuffer = [];
    this.publishedCount = 0;

    const deleteAllEvent: DeleteAllEvent = {
      id: makeId(),
      time: unixNow(),
      event: "delete_all",
      topic,
    };

    const sseFrame = new TextEncoder().encode(toSseFrame("delete_all", deleteAllEvent, deleteAllEvent.id));
    const wsFrame = JSON.stringify(deleteAllEvent);

    const dead: string[] = [];
    await Promise.all(
      [...this.subscribers.entries()].map(async ([id, sub]) => {
        try {
          if (sub.kind === "sse") {
            await sub.writer.write(sseFrame);
          } else {
            sub.socket.send(wsFrame);
          }
        } catch {
          if (sub.keepalive) clearInterval(sub.keepalive);
          dead.push(id);
        }
      }),
    );

    for (const id of dead) {
      this.subscribers.delete(id);
    }

    console.log(
      JSON.stringify({
        event: "delete_all",
        topic,
        deletedCount,
        subscribers: this.subscribers.size,
        deadSubscribers: dead.length,
        clientIp,
        userAgent,
      }),
    );

    return json({ ...deleteAllEvent, deletedCount }, { status: 200 });
  }

  private handleMessages(request: Request): Response {
    const topic = request.headers.get("x-topic") || this.ctx.id.toString();
    this.pruneByTime(Date.now());

    const messages = this.replayBuffer.map((event) => ({
      id: event.id,
      time: event.time,
      message: event.message,
      ...(event.title ? { title: event.title } : {}),
      ...(event.priority !== undefined ? { priority: event.priority } : {}),
      ...(event.tags ? { tags: event.tags } : {}),
    }));

    return json({
      topic,
      messages,
      count: messages.length,
    }, { status: 200 });
  }

  private async handlePoll(request: Request): Promise<Response> {
    const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const topic = request.headers.get("x-topic") || this.ctx.id.toString();
    const pollParam = request.headers.get("x-poll") || "30";
    const sinceParam = request.headers.get("x-since-param") || undefined;

    const pollMs = Math.min(Math.max(Number(pollParam) * 1000, 1000), 60000);
    const sinceTime = sinceParam ? Number(sinceParam) : 0;
    const deadline = Date.now() + pollMs;

    while (Date.now() < deadline) {
      const newMessages = this.replayBuffer.filter((e) => e.time > sinceTime);
      if (newMessages.length > 0) {
        const messages = newMessages.map((event) => ({
          id: event.id,
          time: event.time,
          message: event.message,
          ...(event.title ? { title: event.title } : {}),
          ...(event.priority !== undefined ? { priority: event.priority } : {}),
          ...(event.tags ? { tags: event.tags } : {}),
        }));

        console.log(
          JSON.stringify({
            event: "poll_response",
            topic,
            messageCount: messages.length,
            clientIp,
            userAgent,
          }),
        );

        return json({
          topic,
          messages,
          count: messages.length,
        }, { status: 200 });
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(
      JSON.stringify({
        event: "poll_timeout",
        topic,
        pollMs,
        clientIp,
        userAgent,
      }),
    );

    return json({
      topic,
      messages: [],
      count: 0,
      timeout: true,
    }, { status: 200 });
  }

  private async handleRetention(request: Request): Promise<Response> {
    const topic = request.headers.get("x-topic") || this.ctx.id.toString();

    const rawBody = await request.text();
    let body: { duration?: number };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ code: 400, error: "invalid JSON" }, { status: 400 });
    }

    if (body.duration === undefined || typeof body.duration !== "number" || body.duration < 0) {
      return json({ code: 400, error: "duration must be a non-negative number (milliseconds)" }, { status: 400 });
    }

    this.topicRetentionMs = Math.trunc(body.duration);

    console.log(
      JSON.stringify({
        event: "retention_set",
        topic,
        durationMs: this.topicRetentionMs,
      }),
    );

    return json({
      topic,
      retentionDurationMs: this.topicRetentionMs,
    }, { status: 200 });
  }

  private async handlePermissions(request: Request): Promise<Response> {
    const topic = request.headers.get("x-topic") || this.ctx.id.toString();

    const rawBody = await request.text();
    let body: { permission?: string };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ code: 400, error: "invalid JSON" }, { status: 400 });
    }

    if (!body.permission) {
      return json({ code: 400, error: "permission is required" }, { status: 400 });
    }

    const validPermissions = ["read-write", "read-only", "write-only", "none"];
    if (!validPermissions.includes(body.permission)) {
      return json({ code: 400, error: `permission must be one of: ${validPermissions.join(", ")}` }, { status: 400 });
    }

    this.topicPermission = body.permission as "read-write" | "read-only" | "write-only" | "none";

    console.log(
      JSON.stringify({
        event: "permission_set",
        topic,
        permission: this.topicPermission,
      }),
    );

    return json({
      topic,
      permission: this.topicPermission,
    }, { status: 200 });
  }

  private pruneRecentPublishes(nowMs: number): void {
    const cutoff = nowMs - this.rateLimitWindowMs;
    this.recentPublishTimestamps = this.recentPublishTimestamps.filter((ts) => ts > cutoff);
  }
}
