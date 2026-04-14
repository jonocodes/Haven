# Haven — Browser-Defined Backends for Offline-First Apps


This repo is an exploration of various ways of making a generic backend datastore, that works offline, and requires no personal server hosting.

This doc should be more generic but for now is mostly a copy of docs/heavy/README.md

**heavy** is a full implementation of a backend service

**lite** are experiments where minimal or no backend services are required to be setup



## Summary

**Haven** is a browser-first, local-first data system where users own their data and apps plug into a shared, user-controlled provider for sync and durability.

Haven is not a database product. It is a **personal data layer** for apps.

This document explores a system for browser-first apps that can define their own backend data model, provision user-owned storage, and sync data without requiring the app developer to run a traditional backend service.

The current concrete implementation path is a Haven-native provider using a document-first, local-first sync engine (e.g., Fireproof). The longer-term goal is a flexible provider protocol that can support multiple backends.

The design target is closer in spirit to remoteStorage than to Firebase or Supabase:

- the user owns the backend account or namespace
- the app is browser-first
- the app declares its own data model
- the app should work offline first and sync later
- the developer should not need to run a custom backend for each app

At the same time, this system is intentionally different from Solid:

- cross-app interoperability is not a goal
- each app has its own isolated data model
- the focus is developer ergonomics and app portability, not shared vocabularies

---

## Motivation

Haven exists to give users a single, local-first data environment that multiple apps can use—without requiring each app to ship and operate its own backend.

Modern backend tools still assume a server-oriented control plane.

Even tools that feel lightweight often still require:

- a CLI
- schema pushes
- dashboard setup
- a hosted control layer
- backend ownership by the app developer

That creates friction for browser-first apps, especially if the goal is something more like remoteStorage:

- import a client library
- define your app's data model in code
- connect to a user-owned backend
- read and write data directly from the browser
- sync automatically when online

The ideal system would let an app behave as if its backend is just another user-selected capability, similar to choosing a remoteStorage server.

---

## Core Goals

### Primary goals

- browser-first integration
- user-owned backend resources
- app-defined data model
- multiple apps per user account/system
- offline-first local data with sync
- no per-app custom server code

### Non-goals

- cross-app interoperability
- a universal shared schema
- RDF / semantic web modeling
- strict relational modeling as the primary abstraction

---

## Relationship to remoteStorage

### Similarities

Like remoteStorage, this system aims for:

- user-owned storage/accounts
- app access granted by the user
- browser-first apps
- no app-specific backend deployment burden on the developer
- one overall system that can host data for many apps

### Differences

remoteStorage is fundamentally file-oriented.

That means:

- no schema migrations
- no indexes as first-class infrastructure
- no relations or query planning
- fewer privileged operations

This proposal is harder because it wants structured application data with sync.

That introduces:

- app-defined structure
- local query behavior
- index requests
- migration/version concerns
- conflict and sync semantics

So this is best understood as:

**remoteStorage-like UX and ownership, but for offline-first document data rather than files.**

---

## Relationship to Solid

This overlaps with Solid in spirit, but differs in an important way.

### Similarities to Solid

- user-controlled backend resources
- apps are not expected to run their own bespoke backend
- browser-first interaction
- storage and app logic are more decoupled than in typical SaaS architectures

### Differences from Solid

Solid emphasizes:

- cross-app interoperability
- shared data vocabularies
- RDF / linked data
- apps adapting to common user data

This proposal instead emphasizes:

- app-scoped namespaces
- app-defined document models
- no cross-app schema compatibility requirement
- simpler developer experience

A useful shorthand is:

**Solid is data-primary. This proposal is app-primary.**

The data is user-owned, but each app still gets to define its own model.

---



---

## The key tension: browser-defined data model vs trusted provisioning

The main design tension is this:

- the app should define its own model in browser-side code
- but backend systems usually treat schema as admin state

In remoteStorage, this tension barely exists because the server is mostly storing files.

In a structured data system, the server may need to:

- build indexes
- validate shape changes
- apply migrations
- prevent one app from damaging another app's data

That is why systems like Instant end up with a privileged provisioning path.

The current workaround is a server-side provisioner or control plane.

That is workable, but undesirable if the goal is something more like remoteStorage, where anyone can point to a provider and go.

---

## The ideal model: schema as app data, not admin state

In the ideal version of this system, the backend would not treat schema as a privileged admin operation.

Instead, each app would publish a versioned manifest describing things like:

- collections
- fields
- indexes requested
- permissions metadata
- migration hints

That manifest would be treated more like app data or namespace metadata.

The backend provider would then:

- store the manifest under the app's namespace
- validate it against allowed operations
- materialize indexes or query helpers as needed
- allow safe upgrades automatically
- require extra confirmation only for clearly destructive changes

This would make browser-side provisioning much more plausible.

---

## Why a document-focused model fits better

A strict relational schema is a poor fit for this goal because it makes schema inherently privileged.

A document-focused model fits better because:

- shape can evolve more gradually
- old and new versions can coexist more easily
- validation can happen in the app/runtime layer
- provider-side indexing can be treated as an optimization
- local storage maps naturally to offline-first app behavior

So the preferred long-term shape is:

- document-focused
- offline-first
- sync-first
- soft-schema rather than hard-schema

In this model, the app still has a schema, but it is better understood as:

- validation metadata
- UI metadata
- query/index hints
- migration/version metadata

not as a privileged database migration contract.

---

## Offline-first requirement

Offline-first is a core requirement.

That means each app should have:

- a local database in the browser
- the ability to read and write locally while offline
- deterministic sync when online again
- app-level conflict handling semantics

This pushes the design away from purely server-centric systems and toward something closer to a sync engine.

In practice, this suggests the architecture should look like:

- local document store in the browser
- sync protocol to a provider
- provider-managed namespace for the app
- versioned manifest controlling validation and indexing behavior

This is another reason document-oriented storage is appealing: it maps naturally to local-first data structures.

---

## Ownership model

The preferred ownership model is end-user-owned.

That means:

- the user chooses or creates a backend account with a provider
- the app is authorized by the user
- the app provisions its own isolated namespace within the user's account
- multiple apps can coexist under the same overall user-owned system

This is the model most like remoteStorage.

The app is still app-primary, not interoperability-primary, but the storage/control relationship is user-owned.

---

## How this differs from a typical SaaS backend

In a typical SaaS backend:

- the developer owns the backend
- the user is a tenant inside the app
- the schema is deployed by the developer
- the app and backend are tightly coupled

In this proposal:

- the user owns the provider account or namespace
- the app requests access to a namespace
- the app publishes its own manifest
- the app syncs directly from the browser
- the developer does not run a custom backend per app

So the system is closer to a provider protocol plus sync engine than to a standard hosted application backend.

---

## Current approach

Right now, the practical implementation path is:

- build a Haven-native provider (self-hosted v1)
- use a document-first, local-first sync engine for storage and replication
- keep the browser-side app manifest as the conceptual source of truth
- implement a small provider service for auth, namespaces, manifest publish, and sync coordination

This is not the final ideal, but it is a reasonable path to validating the product.

---

## Longer-term direction

Long-term, this could become a more flexible provider protocol with properties like:

- browser-authorized app provisioning
- app-scoped namespaces
- versioned app manifests
- document-first sync semantics
- optional provider-side indexing/materialization
- multiple providers implementing the Haven protocol

At that point, different storage/sync engines could be used under the same protocol.

---

## Open questions

### Provisioning

Can the provider itself absorb the provisioning role so that no separate server-side provisioner is needed?

### Manifest model

What should an app manifest contain?

Possible pieces:

- app id / namespace id
- manifest version
- collection definitions
- field metadata
- index requests
- migration hints
- permission metadata

### Sync semantics

How should conflicts be handled?

Options include:

- last-write-wins
- per-document revision merges
- field-level merges
- CRDT-backed document structures

### Provider responsibilities

How much should providers enforce?

Possible spectrum:

- dumb sync store
- sync store plus validation
- sync store plus index materialization
- full hosted app backend

### Query model

Should apps query only documents by collection/id, or should providers expose richer query support?

---

## Working thesis

The strongest version of this idea is probably not:

- a thin wrapper around a relational backend

but rather:

- a document-first sync system
- with app-defined soft schemas
- user-owned provider accounts
- browser-first authorization and provisioning
- provider-side optional materialization and indexing

In that sense, the idea is:

**remoteStorage for offline-first app documents, with app-scoped manifests instead of shared data vocabularies.**


---

## Concrete direction: Fireproof-first, protocol-oriented

A practical way to keep scope under control is:

- use Fireproof as the first storage/sync substrate
- define a backend-independent app manifest
- define a provider protocol that could later target other implementations

This keeps the system focused on app portability and provisioning semantics, rather than on building a new database engine.

The important discipline is that Fireproof should be treated as a replaceable engine, not as the whole architecture.

---

## App manifest

The app manifest is the browser-side declaration of what an app needs from a provider.

It should be:

- versioned
- deterministic
- serializable
- backend-independent
- safe to store and compare as data

A useful first shape is:

```ts
export type AppManifest = {
  manifestVersion: 1
  app: {
    id: string
    name?: string
    description?: string
  }
  model: {
    type: 'documents'
    collections: Record<string, CollectionSpec>
  }
  sync?: {
    strategy?: 'documents'
    conflictResolution?: 'crdt' | 'lww' | 'provider-default'
  }
  permissions?: {
    defaultAccess?: 'private' | 'shared'
  }
  indexes?: IndexSpec[]
  migrations?: MigrationSpec[]
}

export type CollectionSpec = {
  fields?: Record<string, FieldSpec>
  required?: string[]
}

export type FieldSpec = {
  type:
    | 'string'
    | 'number'
    | 'boolean'
    | 'json'
    | 'string[]'
    | 'number[]'
    | 'ref'
    | 'timestamp'
  refCollection?: string
}

export type IndexSpec = {
  collection: string
  fields: string[]
  unique?: boolean
}

export type MigrationSpec = {
  fromVersion: number
  toVersion: number
  aliases?: Record<string, string>
  notes?: string
}
```

This should be understood as a **soft schema**:

- collections are logical collections, not necessarily physical tables
- fields are validation and tooling metadata
- indexes are requested capabilities, not guaranteed implementation details
- migrations are app-level upgrade hints, not SQL migrations

That distinction matters because it allows the provider to stay flexible.

---

## Example manifest

```ts
export const notesManifest: AppManifest = {
  manifestVersion: 1,
  app: {
    id: 'notes-app',
    name: 'Notes'
  },
  model: {
    type: 'documents',
    collections: {
      notes: {
        fields: {
          title: { type: 'string' },
          body: { type: 'string' },
          tags: { type: 'string[]' },
          updatedAt: { type: 'timestamp' }
        },
        required: ['title', 'updatedAt']
      }
    }
  },
  sync: {
    strategy: 'documents',
    conflictResolution: 'crdt'
  },
  permissions: {
    defaultAccess: 'private'
  },
  indexes: [
    { collection: 'notes', fields: ['updatedAt'] },
    { collection: 'notes', fields: ['tags'] }
  ],
  migrations: [
    {
      fromVersion: 1,
      toVersion: 2,
      aliases: {
        'notes.content': 'notes.body'
      }
    }
  ]
}
```

---

## Manifest design principles

### 1. Soft schema, not hard schema

The manifest should describe what the app expects, not force a specific storage layout.

### 2. App-scoped authority

An app can only publish manifests for its own namespace.

### 3. Additive-first evolution

Providers should make additive changes easy and destructive changes explicit.

### 4. Provider tolerance

A provider may ignore unsupported hints, especially advanced indexes, while still serving the app.

### 5. Local-first compatibility

The manifest should be usable both:

- by the local browser runtime
- by the remote provider

This avoids a split-brain model where local and remote disagree about document shape.

---

## Provider protocol

The provider protocol is the part that survives backend swaps.

It should answer five questions:

1. How does an app discover/connect to a provider?
2. How does a user authorize an app namespace?
3. How does the app publish or upgrade its manifest?
4. How does the app sync documents?
5. How does the app query documents?

A useful first protocol surface is:

```ts
export interface Provider {
  authorize(input: AuthorizeInput): Promise<AuthorizeResult>
  ensureNamespace(input: EnsureNamespaceInput): Promise<NamespaceInfo>
  publishManifest(input: PublishManifestInput): Promise<ManifestPublishResult>
  sync(input: SyncInput): Promise<SyncResult>
  query(input: QueryInput): Promise<QueryResult>
}
```

### Authorize

```ts
export type AuthorizeInput = {
  appId: string
  providerUrl: string
  scopes?: string[]
}

export type AuthorizeResult = {
  accessToken: string
  subjectId: string
  providerInfo: {
    name?: string
    capabilities: string[]
  }
}
```

This is the equivalent of remoteStorage authorization.

### Ensure namespace

```ts
export type EnsureNamespaceInput = {
  accessToken: string
  appId: string
}

export type NamespaceInfo = {
  namespaceId: string
  ownerId: string
}
```

The provider ensures the app has its own isolated namespace under the user's account.

### Publish manifest

```ts
export type PublishManifestInput = {
  accessToken: string
  namespaceId: string
  manifest: AppManifest
}

export type ManifestPublishResult = {
  accepted: boolean
  appliedManifestVersion: number
  warnings?: string[]
}
```

Important point: this is not an admin schema push. It is a namespace-scoped publication of app metadata.

### Sync

```ts
export type SyncInput = {
  accessToken: string
  namespaceId: string
  since?: string
  changes: DocumentChange[]
}

export type DocumentChange = {
  collection: string
  documentId: string
  op: 'put' | 'delete'
  value?: unknown
  clock?: unknown
}

export type SyncResult = {
  nextCursor: string
  changes: DocumentChange[]
}
```

The underlying sync implementation may be Fireproof-specific at first, but the protocol should keep this surface generic.

### Query

```ts
export type QueryInput = {
  accessToken: string
  namespaceId: string
  collection: string
  where?: Record<string, unknown>
  orderBy?: string[]
  limit?: number
}

export type QueryResult = {
  documents: Array<Record<string, unknown>>
}
```

This should stay intentionally modest at first.

---

## Fireproof-first mapping

A Fireproof-first provider adapter would roughly map the protocol like this:

- `authorize` -> user grants the app access to a provider account/space
- `ensureNamespace` -> create or locate an app-specific Fireproof database/store
- `publishManifest` -> store the manifest in provider metadata and configure optional indexes/materializations
- `sync` -> delegate document replication to Fireproof-compatible sync infrastructure
- `query` -> use Fireproof query/index facilities where available, or fall back to local query behavior

The important thing is that Fireproof is only the implementation of:

- local document persistence
- replication
- merge behavior

It is not the definition of the user-facing protocol.

---

## What must remain outside Fireproof

To avoid accidentally turning Fireproof into the whole product, these concerns should remain part of the higher-level protocol layer:

- provider discovery
- app authorization semantics
- namespace naming and isolation
- manifest versioning
- migration policy
- provider capability negotiation
- multi-app account model

These are the parts that make the system feel like remoteStorage rather than just like an embedded sync database.

---

## Capability negotiation

Providers may differ.

A protocol-friendly system should let providers advertise capabilities such as:

- `documents`
- `crdt-sync`
- `secondary-indexes`
- `full-text-search`
- `sharing`
- `encrypted-storage`
- `local-caching`

This allows the app to adapt gracefully.

For example, a provider might support:

- document storage
- sync
- simple indexes

but not:

- full text search
- shared collections

That is acceptable if the base protocol is designed to degrade well.

---

## Migration policy

Because the manifest is soft schema, migrations should mostly be treated as compatibility metadata.

### Safe automatic changes

- add collection
- add optional field
- request new index
- add alias/rename metadata

### Higher-friction changes

- delete field
- delete collection
- incompatible field type changes
- required-field tightening on existing collections

The provider can choose to:

- accept automatically
- warn
- reject
- require explicit user confirmation

This is a much better fit for browser-authored manifests than a privileged SQL migration model.

---

## Suggested first cut

A minimal first implementation should support only:

- document collections
- per-app isolated namespaces
- CRDT or provider-default sync
- simple field metadata
- simple secondary index requests
- additive migrations

Everything else can wait.

This keeps the protocol small and avoids overcommitting to a complex query or schema language too early.

---

## Self-hosted provider v1

A good first provider implementation should avoid unnecessary infrastructure dependencies.

In particular, it should not require:

- S3 or another third-party object store
- a heavyweight database cluster
- a separate provisioning service beyond the provider itself

A reasonable first shape is:

- **filesystem for blob storage**
- **SQLite for metadata**
- **a small provider server for auth, namespace management, manifest publish, and sync coordination**

This is conceptually much closer to a self-hosted remoteStorage server than to a cloud backend platform.

---

## How data is stored server-side

The storage model should be split into two layers.

### 1. Blob layer

The blob layer stores immutable document data and sync artifacts.

This layer is a good fit for the filesystem because:

- immutable blobs map naturally to files
- a self-hosted provider should be easy to run on a single machine
- this avoids introducing a dependency on S3-style infrastructure
- it keeps the architecture understandable and inspectable

A simple directory layout might look like:

```text
provider-data/
  blobs/
    ab/
      cdef1234...
    98/
      76fedcba...
  namespaces/
    user-123/
      notes-app/
      tasks-app/
```

The exact layout is an implementation detail, but the important point is that document/sync payloads are persisted as ordinary files on disk.

### 2. Metadata layer

The metadata layer stores things like:

- user accounts
- provider sessions
- app namespaces
- manifest versions
- namespace heads/cursors
- capability grants
- sharing metadata
- provider capability info

SQLite is a good fit for this layer because:

- it is simple to deploy
- it is durable enough for a first provider
- it handles structured metadata well
- it avoids the need to run a separate database service

This is a better use of SQLite than trying to force all document blobs and history into a relational table model.

PostgreSQL should remain an eventual option for this layer as well.

That would be useful if the provider later needs:

- multi-node deployment
- stronger concurrent write handling
- richer operational tooling
- managed database hosting options

So the intended path is:

- **v1:** SQLite for simplicity
- **later option:** PostgreSQL for a more scalable provider metadata layer

The protocol and provider model should avoid depending on SQLite-specific behavior so this remains a clean substitution.

---

## Why not use SQLite for everything

Using SQLite for all provider data is possible, but it is not the best conceptual fit.

The system wants to behave like:

- a local-first document sync provider
- with immutable content and sync metadata
- plus provider-side account and namespace records

That maps more cleanly to:

- files for immutable payloads
- SQLite for provider metadata

rather than to one large relational store.

This split also makes it easier to evolve later toward:

- filesystem-backed self-hosting
- alternative blob stores
- optional cloud object storage

without redesigning the protocol.

---

## Provider responsibilities in v1

The provider server should do only a small set of jobs:

- authenticate the user
- authorize app access to namespaces
- create or locate per-app namespaces
- accept and store app manifests
- coordinate sync cursors / namespace heads
- serve and accept document changes
- optionally build or maintain indexes

Importantly, it should **not** become an app-specific business logic backend.

It is a storage and sync provider, not an application server.

---

## Authentication and authorization

Authentication and authorization should be separated.

### Authentication

Authentication answers:

- who is this user?

For v1, the provider should use a conventional login mechanism such as:

- email magic link
- username/password
- OAuth through Google or GitHub

The exact identity provider can vary, but the key point is that the provider owns the user account relationship.

This is similar to how a remoteStorage server has its own account system.

### Authorization

Authorization answers:

- which app can access which namespace?
- what operations are allowed?

A good model is:

- user signs into the provider
- app requests access to its namespace
- provider issues a namespace-scoped token
- app uses that token for manifest publication, sync, and query operations

That token should be limited to:

- one user account
- one app namespace
- a bounded set of capabilities

For example, capabilities might include:

- `manifest:publish`
- `documents:read`
- `documents:write`
- `sync`
- `query`

This keeps the security model aligned with the app-scoped design.

---

## Recommended namespace model

A namespace should be scoped by both:

- the owning user
- the app id

Conceptually:

```text
namespace = <user-id>/<app-id>
```

Examples:

- `jono/notes-app`
- `jono/tasks-app`
- `jono/recipes-app`

This makes multiple apps under one user-owned provider account straightforward.

Each namespace gets its own:

- manifest history
- document collections
- sync heads/cursors
- capability grants
- optional indexes

That preserves app isolation without requiring separate provider accounts per app.

---

## Suggested token flow

A simple first token flow could be:

1. user signs into the provider
2. app redirects the user to authorize access for `appId`
3. provider asks whether to create or reuse namespace `<user-id>/<app-id>`
4. provider returns a namespace-scoped access token to the app
5. app calls:
   - `ensureNamespace`
   - `publishManifest`
   - `sync`
   - `query`

This is very close to the remoteStorage mental model:

- user chooses provider
- app is granted scoped access
- app works against the user's storage namespace

---

## Notifications and web push

A future provider may also support push-style notifications for sync wakeups, background refresh, or app-level events.

This should be treated as an optional capability, not part of the minimum storage protocol.

### Why push matters

Push could be useful for:

- waking an app when remote changes are available
- prompting background sync where the platform allows it
- delivering app-level notifications derived from namespace data
- reducing wasteful polling

### Two plausible models

#### 1. Native Web Push

The provider can manage Web Push subscriptions directly.

In this model, the provider would:

- store push subscriptions in metadata
- sign push messages with VAPID keys
- associate subscriptions with a user/app namespace
- send notifications when sync-relevant changes occur

This is the most self-contained model, but it means the provider must manage:

- VAPID key generation and rotation
- subscription storage
- delivery logic
- notification policy

#### 2. External push bridge

The provider can also emit events to an external notification system such as ntfy.

In this model, the provider would:

- map namespace or app events to topics/endpoints
- publish sync or notification events outward
- let users or apps decide how those events are consumed

This is attractive because it keeps the provider simpler and makes push more modular.

### Recommended stance

Push should be modeled as a provider capability, for example:

- `push:web`
- `push:bridge`
- `push:ntfy`

The base protocol should not require push support.

Instead:

- v1 can ship without push entirely
- later providers can add push capabilities
- the app can detect what is available and opt in

### Integration shape

A future protocol extension might add operations such as:

- register push subscription
- unregister push subscription
- publish change notification
- list push capabilities

This keeps notifications clearly separate from the core document and sync model.

---

## End-to-end app flow

A first-run browser flow might look like this:

### 1. App startup

The app starts with:

- an embedded manifest
- a local Fireproof-backed store
- no provider authorization yet

The app can already operate locally.

### 2. User chooses a provider

The user enters or selects a provider URL.

Example:

```text
https://storage.example.com
```

### 3. Authorization

The app redirects the user to the provider's auth flow.

The provider authenticates the user and asks whether the app may access its namespace.

### 4. Namespace setup

The app calls `ensureNamespace` using the returned token.

If the namespace does not exist, the provider creates it.

### 5. Manifest publication

The app publishes its manifest.

The provider:

- stores the manifest
- accepts supported features
- warns on unsupported hints
- records the active manifest version

### 6. Sync begins

The app begins syncing local document changes.

The local app remains the primary interactive database. The provider acts as the durable remote sync target.

### 7. Subsequent sessions

On later sessions:

- the app restores local state
- refreshes or reuses its token
- confirms namespace and manifest status
- syncs incremental changes

This preserves offline-first behavior even when the provider is temporarily unavailable.

---

## Minimal SDK shape

A minimal SDK built around this provider model might look like:

```ts
const client = await connectApp({
  providerUrl: 'https://storage.example.com',
  manifest: notesManifest
})

await client.login()
await client.ensureNamespace()
await client.publishManifest()

await client.put('notes', 'note-1', {
  title: 'Hello',
  body: 'world',
  updatedAt: Date.now()
})

const docs = await client.query('notes', {
  orderBy: ['updatedAt'],
  limit: 20
})

await client.sync()
```

The important thing is that this SDK surface should feel like:

- browser-local by default
- provider-connected when authorized
- sync-capable when online

not like a thin wrapper around a traditional remote database.

---

## Phasing the system

To avoid overengineering, the system should be built in phases.

### Phase 1 (MVP)

Focus only on the minimum needed to prove the idea:

- one self-hosted provider
- filesystem + SQLite metadata
- browser SDK
- document collections
- simple queries
- CRDT or provider-default sync
- namespace-scoped auth
- one manifest per app

Explicitly defer:

- multi-provider ecosystem
- push notifications
- advanced queries
- complex migrations
- capability negotiation beyond basics

The goal of this phase is to answer:

> can a user own their data in one local-first shared system that multiple apps can plug into, without each app needing its own backend?

---

### Phase 2

Add:

- PostgreSQL metadata option
- better sync ergonomics
- improved manifest tooling
- basic capability negotiation
- nicer auth UX (OAuth-style flow)

Still defer:

- full protocol standardization
- push as a required feature

---

### Phase 3

Add optional extensions:

- push (Web Push or ntfy integration)
- multiple provider implementations
- richer query capabilities
- sharing between users

Only at this stage should the system start looking like a general provider protocol.

---

## First app: Todo / Notes (detailed design)

This section makes the first app concrete. The goal is to validate the system with a real use case, not abstract architecture.

### Data model

We intentionally keep this simple and document-oriented.

Collections:

```ts
collections: {
  notes: {
    fields: {
      title: { type: 'string' },
      body: { type: 'string' },
      tags: { type: 'string[]' },
      updatedAt: { type: 'timestamp' },
      archived: { type: 'boolean' }
    },
    required: ['title', 'updatedAt']
  },
  todos: {
    fields: {
      text: { type: 'string' },
      completed: { type: 'boolean' },
      dueAt: { type: 'timestamp' },
      tags: { type: 'string[]' },
      updatedAt: { type: 'timestamp' }
    },
    required: ['text', 'completed', 'updatedAt']
  }
}
```

Indexes (minimal):

```ts
indexes: [
  { collection: 'notes', fields: ['updatedAt'] },
  { collection: 'todos', fields: ['completed', 'updatedAt'] }
]
```

### Core queries

The app should only rely on a very small set of queries:

- list notes ordered by updatedAt
- filter notes by tag
- list todos by completion state
- list todos due soon

Example usage:

```ts
client.query('notes', {
  orderBy: ['updatedAt'],
  limit: 50
})

client.query('todos', {
  where: { completed: false },
  orderBy: ['updatedAt']
})
```

If these queries feel awkward or hard to express, the protocol is wrong.

### Local-first behavior

The app must work fully offline:

- create/edit notes offline
- toggle todos offline
- filter/search locally

The local database is always the primary source of truth.

Sync should be:

- automatic when online
- invisible to the user
- resilient to interruptions

### Sync expectations

For this app, sync should guarantee:

- no data loss
- eventual convergence across devices
- simple conflict behavior

We can start with:

- per-document last-write-wins or CRDT-backed merge

We do not need complex conflict resolution UI in v1.

### Multi-device scenario

Test case:

- open app on laptop and phone
- go offline on phone
- create/edit notes
- reconnect

Expected:

- both devices converge automatically
- no manual merge step required

If this is not smooth, the system fails its core goal.

### Provider interaction

The app should only need to do:

- login
- ensureNamespace
- publishManifest (once or on upgrade)
- sync periodically

Everything else should feel local.

### UX constraints

The app UX should reinforce the model:

- no "loading from server" states for basic actions
- edits feel instant
- sync is background
- provider is only visible at setup time

### What this app validates

This single app should validate:

- manifest shape is sufficient
- query model is sufficient
- sync model is reliable
- auth + provider flow is understandable
- multiple collections per app work cleanly

If any of these feel awkward, the architecture needs to change before adding more features or apps.

---

## Apps to build

The fastest way to validate this idea is through concrete apps.

### 1. Todo / Notes app (first app)

This should be the canonical demo and testbed.

Why:

- naturally document-oriented
- benefits heavily from offline-first
- easy to reason about
- familiar to developers

Key features:

- notes collection
- todo list collection
- tags
- offline editing
- automatic sync
- simple filtering and ordering

This app should prove:

- manifest model works
- sync works
- auth flow is understandable
- provider setup is not painful
- one user-owned provider can support multiple app-shaped datasets

---

### 2. Bookmark / Read-later app

Why:

- simple data model
- real-world usefulness
- tests indexing and querying

Features:

- URL
- title
- tags
- read/unread state
- savedAt timestamp

This stresses:

- query model
- index hints
- multi-device sync

---

### 3. Personal knowledge base (lightweight)

Why:

- slightly more complex structure
- richer document relationships

Features:

- notes
- links between notes
- tags

This tests:

- document relationships
- schema evolution
- migration hints

---

## Why this is not trying to beat Supabase or Firebase

This project should not be framed as a general replacement for hosted application backends.

Its core value is different:

- the user owns the storage account or namespace
- multiple apps can plug into the same overall provider
- the app remains local-first
- sync is an extension of local state, not the primary source of truth

Supabase and Firebase solve a different problem well:

- developer-owned hosted backends
- server-centric operational model
- app-specific infrastructure

This proposal is aimed instead at:

- personal software
- self-hosted software
- browser-first offline-first apps
- users who want their data to live in a shared provider they control

So the success criterion is not feature parity.

The success criterion is whether this produces a simpler and more natural model for local-first apps whose users want durable, user-controlled sync.

## Haven (naming and positioning)

**Haven** emphasizes:

- a safe place for your data
- user ownership and control
- apps plugging into your data environment

Suggested tagline:

> Haven — local-first data for your apps

In code, Haven should appear as:

```ts
import { connectApp } from '@haven/core'
```

And in product language:

- "connect your app to a Haven provider"
- "store your data in your Haven"

---

## Haven developer experience (high-level)

The goal is that building with Haven feels like building a local app first, with sync added by default.

A developer should:

1. define a manifest in code
2. connect to a Haven provider (user-selected)
3. read/write data locally
4. let sync happen automatically

There should be no requirement to:

- run a backend for the app
- deploy schema through a privileged channel
- manage server infrastructure

### Minimal mental model

- local store = primary
- Haven provider = durability + sync
- manifest = app’s contract with the provider

---

## SDK surface (conceptual)

The SDK should stay small and predictable. Conceptually:

- `connectApp` → connect to a Haven provider
- `login` → user authorizes the app
- `ensureNamespace` → ensure app space exists
- `publishManifest` → publish/update manifest
- `put/get/query` → operate on local data
- `sync` → reconcile with provider

Important constraint:

> All data operations should work without a network connection.

The SDK should not expose server-specific concepts like tables, migrations, or admin roles.

---

## Provider API (first-pass)

This section is intentionally high-level. It is meant to define the shape of a Haven provider without locking implementation details too early.

A first-pass provider can expose a small set of HTTP endpoints.

### Discovery

```http
GET /.well-known/haven
```

Purpose:

- identify the server as a Haven provider
- advertise basic capabilities
- provide auth endpoints and provider metadata

Example response shape:

```json
{
  "name": "My Haven",
  "capabilities": ["documents", "sync", "secondary-indexes"],
  "auth": {
    "authorizeUrl": "/authorize",
    "tokenUrl": "/token"
  }
}
```

### Authorization start

```http
GET /authorize?app_id=notes-app&redirect_uri=...
```

Purpose:

- let the user log in to the provider
- show the app requesting access
- ask whether the app may access or create its namespace

This should feel OAuth-like, even if the exact implementation is simpler.

### Token exchange / session completion

```http
POST /token
```

Purpose:

- return a namespace-scoped token to the app after successful user authorization

The exact token shape can vary, but it should encode or map to:

- user identity
- app id
- namespace id
- allowed capabilities

### Ensure namespace

```http
POST /v1/namespaces/ensure
```

Purpose:

- create or return the namespace for `<user>/<app>`

Example request shape:

```json
{
  "appId": "notes-app"
}
```

Example response shape:

```json
{
  "namespaceId": "jono/notes-app"
}
```

### Publish manifest

```http
PUT /v1/namespaces/{namespaceId}/manifest
```

Purpose:

- publish or update the manifest for the namespace
- return warnings if unsupported hints are present

Example response shape:

```json
{
  "accepted": true,
  "appliedManifestVersion": 1,
  "warnings": []
}
```

### Sync

```http
POST /v1/namespaces/{namespaceId}/sync
```

Purpose:

- send local changes
- receive remote changes since the last cursor

Example request shape:

```json
{
  "since": "cursor-123",
  "changes": []
}
```

Example response shape:

```json
{
  "nextCursor": "cursor-124",
  "changes": []
}
```

### Query

```http
POST /v1/namespaces/{namespaceId}/query
```

Purpose:

- support modest provider-side query operations where useful
- allow local-first apps to fetch remote state when needed

The app should still prefer local query execution for normal interaction.

### Push capability endpoints (later)

These are not part of v1, but a later provider may add endpoints for:

- push subscription registration
- push subscription removal
- push capability discovery

---

## Auth UX flow

Haven should feel user-controlled and comprehensible at authorization time.

A good auth flow should answer three questions clearly for the user:

1. Which provider am I connecting to?
2. Which app is asking for access?
3. What data space is this app allowed to use?

### First-run user flow

#### 1. User opens the app

The app works locally right away, even before provider setup.

UI might say:

- "Your data is currently local to this device."
- "Connect a Haven provider to sync across devices."

#### 2. User chooses provider

The user enters a provider URL or chooses a known provider.

Example:

```text
https://haven.example.com
```

#### 3. App redirects to provider

The provider shows a login/authorization screen.

The page should show:

- provider name
- app name
- requested namespace, such as `notes-app`
- requested capabilities, such as read/write/sync

Suggested copy:

> Notes would like to create or use its own space in your Haven.

#### 4. User approves

The provider asks whether to:

- create the namespace if it does not exist
- reuse the existing namespace if it does

This should be framed as granting the app access to **its own space**, not to all data.

#### 5. Redirect back to app

The app receives a token or code, completes setup, ensures the namespace, and publishes the manifest.

#### 6. App confirms success

Suggested app copy:

- "Connected to your Haven"
- "Notes will now sync across your devices"

### UX principles

- avoid database terms
- avoid infrastructure terms
- make scope visible and limited
- keep approval app-scoped, not account-wide by default
- let users revoke app access later in the provider UI

---

## Hello World Haven app

This is a conceptual walkthrough of the smallest useful Haven app.

### Goal

A tiny notes app that:

- stores notes locally first
- connects to a Haven provider
- syncs across devices

### Developer steps

#### 1. Define a manifest

The developer defines one collection, `notes`, with a few fields.

#### 2. Connect the app

The app initializes the Haven client with:

- provider URL
- manifest
- app id

#### 3. Operate locally

The app reads and writes notes against the local store immediately.

#### 4. Ask the user to connect Haven

When the user wants cross-device sync, the app offers a connect flow.

#### 5. Publish manifest and sync

After authorization, the app ensures its namespace, publishes its manifest, and starts syncing automatically.

### User experience

From the user’s point of view:

- the app works before sign-in
- connecting Haven is optional but valuable
- after connecting, data becomes durable and available across devices

### What Hello World should prove

A good first demo should prove that Haven feels like:

- a local app first
- with optional durable sync
- through a user-chosen provider

It should not feel like:

- signing into a SaaS app
- provisioning a database
- configuring infrastructure

---

## Recommended library categories

To keep Haven v1 pragmatic and avoid reinventing infrastructure, the provider implementation should rely on existing, well-supported libraries.

This section outlines **categories**, not specific packages, so choices can evolve without affecting the architecture.

### HTTP / server

- lightweight HTTP server or framework
- routing and middleware support
- good TypeScript support

### Authentication / sessions

- OAuth / identity provider integration
- session or token handling
- secure cookie / token utilities

### Database (metadata layer)

- SQLite client with migrations support (lightweight)
- optional PostgreSQL client for later phases

### Validation / schemas

- runtime validation for API inputs
- schema definitions shared between client and server

### Logging

- structured logging
- configurable log levels

### Configuration

- environment variable loading
- config file parsing (optional)

### Background jobs / scheduling

- simple task scheduling
- retry logic for sync-related operations (if needed)

### Filesystem utilities

- safe file writes (atomic where possible)
- directory management

### Sync engine integration

- Fireproof (or equivalent) for:
  - local persistence
  - replication
  - merge behavior

This should be treated as an adapter layer, not deeply embedded everywhere.

### Web Push (later)

- Web Push library (VAPID support)
- or external bridge integration (e.g., ntfy)

---

## Implementation stance

Haven v1 should optimize for fast iteration, shared types between browser and provider, and a small self-hosted deployment footprint.

### Language choice

The recommended language for Haven v1 is **TypeScript**.

Why:

- it matches the browser-first SDK and manifest model
- it makes shared types across client and provider straightforward
- it fits well with a document-first sync engine such as Fireproof
- it keeps iteration speed high while the product shape is still evolving

This is a product-development choice, not a statement that TypeScript is the only viable long-term provider language.

A later provider implementation could use another language if the protocol stabilizes and the operational needs change.

### Do not reinvent the wheel

Haven should deliberately depend on existing libraries where they fit the architecture well.

The v1 provider should prefer established packages for:

- HTTP server and routing
- auth and session handling
- SQLite access
- input validation
- logging
- configuration loading
- background jobs / scheduling
- Web Push later, if added

What Haven should define itself:

- the Haven protocol
- namespace semantics
- manifest semantics
- provider UX
- sync/provider integration boundaries

What Haven should avoid building from scratch:

- a web framework
- an auth system
- a database layer
- a general migration framework
- a push delivery stack
- generic storage abstractions beyond what the provider actually needs

### Practical library stance

A good rule is:

> use existing libraries for infrastructure, and write Haven-specific code only for Haven-specific concepts.

That means:

- use the chosen sync engine rather than inventing one
- use standard auth/session libraries rather than inventing auth
- use established SQLite/PostgreSQL libraries rather than inventing a persistence layer
- use existing filesystem and server tooling wherever possible

This helps keep Haven focused on the actual product idea rather than on rebuilding the surrounding platform ecosystem.

---

## CLI (optional, later)

A CLI can exist, but it should be optional and lightweight.

Possible uses:

- running a local Haven provider
- inspecting namespaces and data
- debugging sync

Example (illustrative only):

```bash
haven start
haven login
haven inspect
```

The CLI should not be required for normal app development or deployment.

---

## Decision checkpoint

If this path is adopted, the project should be understood as:

- **not** a new database engine
- **not** a thin wrapper around Instant
- **but** a browser-first provider protocol and SDK
- with a document-first, local-first sync substrate (e.g., Fireproof)
- and a self-hosted provider v1 built from filesystem blobs, SQLite metadata, and namespace-scoped auth tokens

Over time, the provider should also allow:

- PostgreSQL as an alternative metadata store
- optional push notification capabilities such as Web Push or ntfy-style bridges

Those should be treated as replaceable provider features rather than core assumptions of the protocol.

