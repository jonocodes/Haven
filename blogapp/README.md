This is a blogging app where data is stored in remotestorage, and hosted via public pages.

# TODO: write app

idea
    should have a doc for each post
    should have a index.json for the post list. it has the metadata needed for listing. re-gen it when we publish.


 a **minimal blog engine on top of remoteStorage**,

Let me lock in a **simple, consistent model** you can build around:

---

# 🧱 Final Mental Model

You have exactly **two public data types**:

### 1. Individual posts

```
public/posts/<shareId>
```

### 2. Blog index (homepage)

```
public/blog/index
```

That’s it. No extra layers needed.

---

# 📝 Responsibilities (very clear separation)

### Public post

* full content
* source of truth for the article

### Public index

* list of posts
* sorted by date
* minimal summary data
* homepage content

---

# 🔁 Core invariant

> The index is the **only way to discover posts**

Everything flows from that.

---

# ⚙️ Core flows (super simple)

## Publish

```text
1. Write public/posts/<shareId>
2. Load public/blog/index
3. Insert/update summary
4. Sort by publishedAt desc
5. Save index
```

## Update published post

```text
1. Update public/posts/<shareId>
2. Update summary in index
3. Save index
```

## Unpublish

```text
1. Delete public/posts/<shareId>
2. Remove from index
3. Save index
```

---

# 📦 Suggested minimal schemas

## Public post

```json
{
  "version": 1,
  "title": "Post title",
  "body": "Full content",
  "excerpt": "Short summary",
  "publishedAt": "2026-04-19T18:00:00Z",
  "updatedAt": "2026-04-19T18:10:00Z"
}
```

## Public index

```json
{
  "version": 1,
  "title": "My Blog",
  "intro": "Welcome to my blog.",
  "updatedAt": "2026-04-19T18:10:00Z",
  "posts": [
    {
      "shareId": "sh_1",
      "title": "Post title",
      "excerpt": "Short summary",
      "publishedAt": "2026-04-19T18:00:00Z",
      "updatedAt": "2026-04-19T18:10:00Z"
    }
  ]
}
```

---

# 🧠 Why this is the right level of complexity

You intentionally **did NOT add**:

* slugs
* tags
* categories
* pagination
* backend
* search

And that’s good — because:

👉 remoteStorage is strongest when you treat it like
**“publish explicit documents, not query a database”**

Your index = your “query result”

---

# 🚀 Nice properties you now get

* Fully static-feeling blog, no backend
* Works offline + sync
* Instant publish/unpublish
* Stable public URLs
* Easy to extend later (RSS, tags, etc.)

---

# ⚠️ One subtle thing to be aware of

Your index is now a **single mutable document**.

That means:

* always treat writes as **read → modify → write**
* avoid race conditions if you ever edit from multiple devices

For now, totally fine — just something to remember later.

---

# 🧩 Optional tiny upgrades (later, not now)

When you feel like it, these drop in easily:

### 1. RSS / feed

Just publish:

```
public/blog/feed.json
```

### 2. Pre-rendered HTML

Store:

```json
"html": "<p>Rendered content</p>"
```

### 3. Draft preview links

Use a second “preview” public path

---

# 👍 Bottom line

You made the right call:

* ✔ keep ordering = date-based
* ✔ use index only for discovery
* ✔ duplicate small summary data
* ✔ keep system simple

---

If you want next, we can:

* sketch the **exact functions for updating the index safely**
* or design the **public routes (/ vs /p/:id) cleanly**
* or think about **how to host the reader app for best UX**

All pretty fun from here.

