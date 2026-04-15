import { DurableObject } from "cloudflare:workers";

// cfty — Cloudflare-based tiny ntfy-like service
//
// Supported endpoints:
//   POST /:topic     Publish a plain-text message body to a topic
//   PUT  /:topic     Same as POST
//   GET  /:topic     Return lightweight stats for a topic
//   GET  /:topic/sse Subscribe to live SSE events for a topic
//
// Notes:
// - Live-only: no persistence, no replay/history, no filtering
// - Optional global Basic or Bearer auth
// - Intended for use as a drop-in replacement for simple ntfy post + sse use cases

export interface Env {
  TOPIC_HUB: DurableObjectNamespace<TopicHub>;
  MAX_SUBSCRIBERS_PER_TOPIC?: string;
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
  const hasCredentials = Boolean((env.BASIC_AUTH_USER && env.BASIC_AUTH_PASS) || env.BEARER_AUTH_TOKEN);
  if (!hasCredentials) return false;

  const authEnabled = env.AUTH_ENABLED?.trim().toLowerCase();
  if (!authEnabled) return true;

  return !["0", "false", "off", "no"].includes(authEnabled);
}

function isAuthorized(request: Request, env: Env): boolean {
  const auth = request.headers.get("authorization");
  if (!auth) return false;

  if (auth.startsWith("Basic ")) {
    if (!env.BASIC_AUTH_USER || !env.BASIC_AUTH_PASS) return false;

    let decoded = "";
    try {
      decoded = atob(auth.slice("Basic ".length));
    } catch {
      return false;
    }

    const idx = decoded.indexOf(":");
    if (idx < 0) return false;

    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);

    return timingSafeEqual(user, env.BASIC_AUTH_USER) && timingSafeEqual(pass, env.BASIC_AUTH_PASS);
  }

  if (auth.startsWith("Bearer ")) {
    if (!env.BEARER_AUTH_TOKEN) return false;
    const token = auth.slice("Bearer ".length);
    return timingSafeEqual(token, env.BEARER_AUTH_TOKEN);
  }

  return false;
}

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

function makeId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function parseTopicFromPath(pathname: string): { topic: string; isSse: boolean } | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 1) {
    return { topic: parts[0], isSse: false };
  }
  if (parts.length === 2 && parts[1] === "sse") {
    return { topic: parts[0], isSse: true };
  }
  return null;
}

function sanitizeTopic(topic: string): string {
  const t = topic.trim();
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (hasAuthConfigured(env) && !isAuthorized(request, env)) {
      return unauthorized();
    }

    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      return text(
        [
          "cfty — Cloudflare-based tiny ntfy-like service",
          "",
          "Endpoints:",
          "  POST /:topic",
          "  PUT  /:topic",
          "  GET  /:topic",
          "  GET  /:topic/sse",
        ].join("\n"),
      );
    }

    const parsed = parseTopicFromPath(url.pathname);
    if (!parsed) {
      return json({ code: 404, error: "not found" }, { status: 404 });
    }

    let topic: string;
    try {
      topic = sanitizeTopic(parsed.topic);
    } catch (err) {
      return json({ code: 400, error: (err as Error).message }, { status: 400 });
    }

    const id = env.TOPIC_HUB.idFromName(topic);
    const stub = env.TOPIC_HUB.get(id);

    if (parsed.isSse && request.method === "GET") {
      return stub.fetch("https://hub.internal/subscribe", {
        method: "GET",
        headers: {
          "x-topic": topic,
          "cf-connecting-ip": request.headers.get("cf-connecting-ip") || "",
          "user-agent": request.headers.get("user-agent") || "",
        },
      });
    }

    if (!parsed.isSse && request.method === "GET") {
      return stub.fetch("https://hub.internal/stats", {
        method: "GET",
        headers: {
          "x-topic": topic,
        },
      });
    }

    if (!parsed.isSse && (request.method === "POST" || request.method === "PUT")) {
      const message = await request.text();
      const payload = {
        topic,
        message,
        title: parseTitle(request.headers),
      };
      return stub.fetch("https://hub.internal/publish", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-topic": topic,
          "cf-connecting-ip": request.headers.get("cf-connecting-ip") || "",
          "user-agent": request.headers.get("user-agent") || "",
        },
        body: JSON.stringify(payload),
      });
    }

    return json({ code: 405, error: "method not allowed" }, { status: 405 });
  },
};

export class TopicHub extends DurableObject<Env> {
  private publishedCount = 0;
  private readonly rateLimitWindowMs = 10_000;
  private readonly maxPublishesPerWindow = 30;
  private recentPublishTimestamps: number[] = [];
  private subscribers = new Map<
    string,
    {
      writer: WritableStreamDefaultWriter<Uint8Array>;
      keepalive?: ReturnType<typeof setInterval>;
    }
  >();

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

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/stats" && request.method === "GET") {
      return this.handleStats(request);
    }

    if (url.pathname === "/subscribe") {
      return this.handleSubscribe(request);
    }

    if (url.pathname === "/publish" && request.method === "POST") {
      return this.handlePublish(request);
    }

    return json({ code: 404, error: "not found" }, { status: 404 });
  }

  private async handleSubscribe(request: Request): Promise<Response> {
    const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const topic = request.headers.get("x-topic") || this.ctx.id.toString();
    const maxSubscribers = this.maxSubscribersPerTopic();

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
        {
          status: 429,
          headers: {
            "access-control-allow-origin": "*",
          },
        },
      );
    }

    const subscriberId = makeId();
    const encoder = new TextEncoder();

    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();

    this.subscribers.set(subscriberId, { writer });

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
      if (!entry) return;
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

    await writer.write(encoder.encode(toSseFrame("open", openEvent, openEvent.id)));

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

    return new Response(stream.readable, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-store, must-revalidate",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        "access-control-allow-origin": "*",
      },
    });
  }

  private handleStats(request: Request): Response {
    const topic = request.headers.get("x-topic") || this.ctx.id.toString();
    this.pruneRecentPublishes(Date.now());

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

    return json(stats, {
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
      },
    });
  }

  private async handlePublish(request: Request): Promise<Response> {
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
            "access-control-allow-origin": "*",
            "retry-after": String(Math.ceil(this.rateLimitWindowMs / 1000)),
          },
        },
      );
    }
    this.recentPublishTimestamps.push(nowMs);

    const body = (await request.json()) as {
      topic: string;
      message: string;
      title?: string;
    };

    const event: PublishEvent = {
      id: makeId(),
      time: unixNow(),
      event: "message",
      topic: body.topic,
      message: body.message,
      ...(body.title ? { title: body.title } : {}),
    };

    const frame = new TextEncoder().encode(toSseFrame("message", event, event.id));
    this.publishedCount += 1;

    const dead: string[] = [];
    await Promise.all(
      [...this.subscribers.entries()].map(async ([id, sub]) => {
        try {
          await sub.writer.write(frame);
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
        bytes: frame.byteLength,
      }),
    );

    return json(event, {
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
      },
    });
  }

  private pruneRecentPublishes(nowMs: number): void {
    const cutoff = nowMs - this.rateLimitWindowMs;
    this.recentPublishTimestamps = this.recentPublishTimestamps.filter((ts) => ts > cutoff);
  }
}
