import { useEffect, useMemo, useState } from "react";
import { ConnectWidget } from "./components/ConnectWidget";
import { LandingView } from "./components/LandingView";
import { PublicIndexView } from "./components/PublicIndexView";
import { PublicPostView } from "./components/PublicPostView";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { MarkdownEditor } from "./components/MarkdownEditor";
import { deletePost, generatePostId, publishPost, unpublishPost } from "./lib/gardenService";
import { SettingsView } from "./components/SettingsView";
import {
  getPublicIndexUrl,
  isConnected,
  onConnected,
  onDisconnected,
  pullAllPostMeta,
  pullGardenSetting,
  pullIndex,
  pullPostMarkdown,
  storePostMarkdown,
  storePostMeta,
} from "./lib/remotestorage";
import { parseMarkdownToPost } from "./lib/markdown";
import { decodeIndexToken, encodeIndexToken } from "./lib/indexToken";
import type { GardenPostMeta } from "./lib/types";

function sortByUpdatedDescending(items: GardenPostMeta[]): GardenPostMeta[] {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [urlPrefix, setUrlPrefix] = useState('');
  const [connected, setConnected] = useState(isConnected());
  const [view, setView] = useState<"posts" | "settings">("posts");
  const [items, setItems] = useState<GardenPostMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [id, setId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<GardenPostMeta["status"]>("draft");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshList(): Promise<void> {
    const all = await pullAllPostMeta();
    setItems(sortByUpdatedDescending(all));
  }

  useEffect(() => {
    const connectedHandler = () => setConnected(true);
    const disconnectedHandler = () => setConnected(false);
    const popStateHandler = () => setPath(window.location.pathname);
    onConnected(connectedHandler);
    onDisconnected(disconnectedHandler);
    window.addEventListener("popstate", popStateHandler);

    void refreshList().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });

    void pullGardenSetting("title").then((t) => {
      if (t) document.title = t;
    });

    void pullIndex().then((index) => {
      if (index?.urlPrefix) setUrlPrefix(index.urlPrefix);
    });

    return () => window.removeEventListener("popstate", popStateHandler);
  }, []);

  useEffect(() => {
    if (!selectedId) return;

    const selected = items.find((item) => item.id === selectedId);
    if (!selected) return;

    setId(selected.id);
    setTitle(selected.title);
    setExcerpt(selected.excerpt);
    setStatus(selected.status);
    setMessage("");
    setError("");

    void pullPostMarkdown(selected.id)
      .then((content) => setBody(content ?? ""))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [selectedId, items]);

  function clearEditor(): void {
    setSelectedId(null);
    setId(null);
    setTitle("");
    setExcerpt("");
    setBody("");
    setStatus("draft");
    setError("");
    setMessage("");
  }

  const selectedMeta = useMemo(() => items.find((item) => item.id === id) ?? null, [items, id]);
  const publicIndexUrl = getPublicIndexUrl();

  const publicIndexToken = publicIndexUrl ? encodeIndexToken(publicIndexUrl) : null;

  const freePart = urlPrefix || 'garden';
  const indexSegment = publicIndexToken ? `${freePart}/${publicIndexToken}` : null;

  const publicHomePageUrl = indexSegment
    ? `${window.location.origin}/p/${indexSegment}`
    : null;

  const publicPostPageUrl =
    id && indexSegment ? `${window.location.origin}/p/${indexSegment}/${id}` : null;

  if (path === "/") {
    return <LandingView />;
  }

  if (path.startsWith("/public/")) {
    const postIdFromPath = path.split("/").filter(Boolean)[1];
    if (!postIdFromPath) {
      return <p className="mx-auto max-w-3xl p-6 text-red-600">Missing post id in URL.</p>;
    }
    return <PublicPostView postId={postIdFromPath} />;
  }

  if (path.startsWith("/p/")) {
    // Structure: /p/{freetext}/{encoded}[/{postId}]
    const parts = path.split("/").filter(Boolean);
    const encodedPart = parts[2];
    const postId = parts[3];

    const indexUrl = encodedPart ? decodeIndexToken(encodedPart) : null;

    if (encodedPart && !indexUrl) {
      return (
        <p className="mx-auto max-w-3xl p-6 text-red-600">
          "{encodedPart}" does not decode to an index URL
        </p>
      );
    }

    const indexBasePath = `/p/${parts[1]}/${encodedPart ?? ''}`;

    if (postId) {
      return (
        <PublicPostView
          postId={postId}
          indexUrl={indexUrl ?? undefined}
          indexBasePath={indexBasePath}
        />
      );
    }
    return <PublicIndexView indexUrl={indexUrl ?? undefined} indexBasePath={indexBasePath} />;
  }

  if (path !== "/write") {
    return <LandingView />;
  }

  async function saveDraft(): Promise<void> {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const now = new Date().toISOString();
      const parsed = parseMarkdownToPost(body);
      const resolvedTitle = title.trim() || parsed.title || "Untitled";
      const resolvedExcerpt = excerpt.trim() || parsed.excerpt;
      const parsedBody = parsed.body;

      const postId = id ?? (await generatePostId(resolvedTitle || "untitled"));
      const createdAt = selectedMeta?.createdAt ?? now;
      const nextStatus = selectedMeta?.status ?? "draft";
      const nextPublishedAt = selectedMeta?.publishedAt ?? null;
      const nextDeletedAt = selectedMeta?.deletedAt ?? null;

      const meta: GardenPostMeta = {
        version: 1,
        id: postId,
        title: resolvedTitle,
        excerpt: resolvedExcerpt,
        status: nextStatus,
        createdAt,
        updatedAt: now,
        publishedAt: nextPublishedAt,
        deletedAt: nextDeletedAt,
      };

      await storePostMeta(meta);
      await storePostMarkdown(postId, parsedBody);

      setId(postId);
      setTitle(meta.title);
      setExcerpt(meta.excerpt);
      setBody(parsedBody);
      setStatus(meta.status);
      await refreshList();
      setMessage("Draft saved");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: "publish" | "unpublish" | "delete"): Promise<void> {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (!id) {
        throw new Error("Select or save a post first");
      }

      if (action === "publish") {
        await publishPost(id);
        setMessage("Post published");
        setStatus("published");
      } else if (action === "unpublish") {
        await unpublishPost(id);
        setMessage("Post unpublished");
        setStatus("unpublished");
      } else if (action === "delete") {
        const confirmed = window.confirm("Delete this post markdown and metadata?");
        if (!confirmed) return;
        await deletePost(id);
        setMessage("Post deleted");
        clearEditor();
      }

      await refreshList();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6 font-sans text-slate-900">
      <ConnectWidget />

      <header className="mb-6 space-y-2">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-semibold">Loam</h1>
          <nav className="flex gap-2">
            <Button
              variant={view === "posts" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("posts")}
            >
              Posts
            </Button>
            <Button
              variant={view === "settings" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("settings")}
            >
              Settings
            </Button>
            {publicHomePageUrl ? (
              <Button variant="outline" size="sm" asChild>
                <a href={publicHomePageUrl} target="_blank" rel="noreferrer">
                  Open public home page
                </a>
              </Button>
            ) : null}
          </nav>
        </div>
        <p>
          Connection status: <strong>{connected ? "Connected" : "Not connected"}</strong>. Use the
          sync widget in the page corner to connect.
        </p>
      </header>

      {view === "settings" ? <SettingsView onSave={(prefix) => setUrlPrefix(prefix)} /> : null}

      <section
        className={`grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]${view === "settings" ? " hidden" : ""}`}
      >
        <Card>
          <CardHeader>
            <strong>Posts</strong>
            <Button variant="outline" size="sm" onClick={clearEditor}>
              New
            </Button>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? <p className="text-sm text-slate-500">No posts yet.</p> : null}
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <Button
                    variant="secondary"
                    className="h-auto w-full justify-start p-3 text-left"
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div>
                      <div className="font-semibold">{item.title}</div>
                      <div className="text-xs text-slate-500">
                        {item.status} · {item.id}
                      </div>
                    </div>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-4">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Title</span>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-medium">Excerpt</span>
              <Input value={excerpt} onChange={(event) => setExcerpt(event.target.value)} />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-medium">Markdown Body</span>
              <MarkdownEditor value={body} onChange={setBody} />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void saveDraft()}>
                Save draft
              </Button>
              <Button disabled={busy} variant="secondary" onClick={() => void runAction("publish")}>
                Publish
              </Button>
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() => void runAction("unpublish")}
              >
                Unpublish
              </Button>
              <Button
                disabled={busy}
                variant="destructive"
                onClick={() => void runAction("delete")}
              >
                Delete
              </Button>
              {publicPostPageUrl ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={publicPostPageUrl} target="_blank" rel="noreferrer">
                    Open public post page
                  </a>
                </Button>
              ) : null}
              <span className="ml-auto text-xs text-slate-500">Status: {status}</span>
            </div>

            {message ? <p className="text-sm text-green-700">{message}</p> : null}
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
