# Haven Lite — V1 Options

## Purpose

This document narrows the first implementation strategy for Haven.

The goal is not to design the full long-term Haven stack. The goal is to identify the smallest path that proves the core Haven idea:

> a user-owned, local-first data home that multiple apps can plug into without each app needing its own backend.

This document compares three possible starting points:

1. Haven on remoteStorage
2. Haven on Fireproof without a Haven provider
3. Haven with its own provider

---

## What must be preserved

Any Haven Lite approach should preserve these core properties:

- local-first app behavior
- user-controlled or user-owned storage/sync target
- app-scoped namespaces
- one shared system that can support multiple apps
- no app-specific backend the app developer must run

What can be deferred:

- dedicated Haven provider protocol
- push notifications
- advanced queries
- capability negotiation
- multiple storage engines
- polished multi-provider ecosystem

---

## Option 1: Haven on remoteStorage

### Description

Haven becomes a local-first SDK and app model layered on top of remoteStorage.

remoteStorage would provide:

- user accounts
- provider discovery / connection model
- auth flow
- remote persistence target

Haven would add:

- document-oriented local model
- app manifest
- app namespace conventions
- sync/index conventions inside app-controlled remoteStorage areas

### Why this is attractive

This is the closest to the original inspiration.

It reuses an existing:

- user-owned server story
- browser-first mental model
- app authorization model
- hosted or self-hosted provider ecosystem

This avoids building a Haven provider too early.

### What Haven still needs to do

- define how documents map onto remoteStorage paths
- define how manifests are stored
- define how local-first sync state is serialized remotely
- define conflict handling on top of a file-oriented substrate
- possibly build indexing/query conventions above raw stored files

### Strengths

- strongest user-owned story
- closest philosophical match to Haven
- no need to invent provider discovery/auth early
- good self-hosting story from day one

### Weaknesses

- remoteStorage is file-oriented, not document-sync-oriented
- sync semantics may feel awkward
- queries and indexes may become clumsy
- conflict handling may be harder than with a purpose-built local-first engine
- could force Haven into a storage model that is too low-level

### Main risk

The main risk is that Haven becomes a complicated overlay on top of a substrate that was designed for files, not local-first document sync.

### Best case

Haven gets a strong user-owned foundation with minimal infrastructure work.

### Worst case

The fit is poor enough that Haven spends most of its time compensating for remoteStorage’s mismatch.

---

## Option 2: Haven on Fireproof without a Haven provider

### Description

Haven starts as an app-side SDK and conventions layer only.

Fireproof provides the local-first document engine and sync substrate.

Haven adds:

- manifest format
- namespace model
- provider/storage adapter boundary
- app-facing SDK semantics

But Haven does **not** define or ship its own provider/server yet.

Instead, the first version proves the model through one or more existing backends or minimal adapters.

### Why this is attractive

This is likely the smallest path that preserves the local-first document shape.

It keeps the center of gravity on:

- local-first documents
- app developer experience
- shared app model

while postponing the biggest infrastructure questions.

### What Haven still needs to do

- define manifest format
- define namespace conventions
- define the app-facing SDK
- define what an adapter must provide
- choose or build one minimal sync target for testing

### Strengths

- smallest scope among the three options
- best fit for document-first, local-first behavior
- avoids building a provider too early
- lets Haven discover its real abstractions through use
- easiest way to avoid reinventing too much

### Weaknesses

- the user-owned provider story is weaker or less complete at first
- may rely on temporary or imperfect storage/sync adapters
- may postpone hard but important questions about user-owned accounts and provider UX

### Main risk

The main risk is that Haven proves a good local-first SDK but postpones the hardest and most distinctive part: the durable user-owned provider model.

### Best case

Haven rapidly proves its core app model and discovers what the provider actually needs to be later.

### Worst case

Haven becomes “just a wrapper around Fireproof” without a compelling user-owned story.

---

## Option 3: Haven with its own provider

### Description

Haven ships its own self-hosted provider from the start.

That provider handles:

- auth
- namespaces
- manifest publication
- sync coordination
- server-side persistence

This is the most complete and most ambitious path.

### Why this is attractive

It gives Haven its clearest identity from the beginning.

It also makes the user-owned story fully explicit:

- users choose a Haven provider
- apps connect directly to it
- one provider can support multiple apps

### What Haven still needs to do

- define and implement provider API
- choose auth stack
- choose storage layout
- integrate sync engine
- build provider UX and admin surface
- ship self-hosting story

### Strengths

- clearest product story
- strongest ownership and self-hosting story
- most direct path to a real Haven ecosystem
- least dependent on mismatched external assumptions

### Weaknesses

- biggest scope
- highest implementation burden
- most risk of reinventing infrastructure
- easiest path to overengineering

### Main risk

The main risk is building too much system before proving that the Haven model is actually valuable in practice.

### Best case

Haven launches with a complete, coherent system and strong identity.

### Worst case

Haven turns into a large infrastructure project before its core product assumptions are validated.

---

## Comparison summary

### Option 1: remoteStorage

Best for:

- strongest immediate user-owned story
- minimal provider/auth reinvention
- alignment with original inspiration

Weakest on:

- document/query/sync fit

### Option 2: Fireproof without provider

Best for:

- smallest scope
- fastest validation of local-first app model
- avoiding overengineering

Weakest on:

- full user-owned provider experience on day one

### Option 3: Haven provider

Best for:

- clearest end-state product story
- strongest Haven identity

Weakest on:

- scope and infrastructure burden

---

## Current recommendation

At this stage, the most promising path appears to be:

### Primary recommendation: Option 2

Start with **Haven on Fireproof without a Haven provider**, but make the sync target a **minimal self-hosted server**.

Why:

- it preserves the local-first document model
- it is still much smaller than building a full Haven provider
- it avoids prematurely building provider infrastructure
- it gives Haven a concrete user-controlled sync target
- it keeps the architecture simple enough to learn from

### Secondary exploration: Option 1

Keep **Haven on remoteStorage** as a serious parallel exploration.

Why:

- it may unlock a much stronger user-owned story with far less new infrastructure
- even if it is not the final architecture, it may teach Haven what provider UX should feel like

### Deferred unless clearly needed: full Haven provider

Treat **Haven with its own full provider** as a later move, unless early experiments show that neither remoteStorage nor the minimal-server Fireproof approach can preserve the core Haven experience.

---

## Minimal server path

This is the preferred Haven Lite implementation path for now.

### What the minimal server is

The minimal server is **not** a full Haven provider.

It is a thin sync target that adds just enough server-side behavior to support:

- durable remote storage
- per-app namespaces
- basic auth
- sync cursors / change coordination
- manifest storage

It should not try to become:

- a generic backend platform
- a rich query service
- a collaboration service
- a full account management product

### What stays client-side

The browser app still owns:

- the local-first data model
- local queries
- local persistence
- most interactive behavior
- manifest definition

The server is mainly there for:

- durability
- synchronization between devices
- namespace isolation

### What the minimal server should do

At minimum:

- accept authenticated upload/download of sync artifacts
- map users and apps to namespaces
- store a manifest per namespace
- track a latest cursor / head per namespace
- return remote changes since a given cursor

### What the minimal server should not do

At first, it should not do:

- provider discovery ecosystem
- complex permissions
- advanced indexing
- server-side querying for normal app use
- push notifications
- sharing/collaboration

---

## Minimal server responsibilities

A first implementation can be thought of in three layers:

### 1. File storage layer

Purpose:

- store immutable blobs / sync artifacts on disk

Implementation shape:

- regular filesystem directories
- simple content-addressed filenames or namespace-scoped files

### 2. Metadata layer

Purpose:

- users
- sessions or tokens
- namespace records
- manifest version records
- sync cursors / latest head pointers

Implementation shape:

- SQLite

### 3. Thin HTTP API

Purpose:

- auth/login completion
- namespace lookup
- manifest publish
- sync exchange

Implementation shape:

- lightweight TypeScript server

---

## Minimal server endpoints (conceptual)

These are intentionally sparse.

### `POST /login`

- authenticate user or complete session flow
- return session/token

### `POST /namespaces/ensure`

- ensure namespace exists for `<user>/<app>`
- return namespace id

### `PUT /namespaces/:id/manifest`

- store/update manifest for namespace

### `POST /namespaces/:id/sync`

- accept local changes
- return remote changes since cursor

### `GET /namespaces/:id/blob/:blobId`

- retrieve stored blob if needed

### `POST /namespaces/:id/blob`

- upload blob if needed

This should be enough to validate the path without standardizing too much too early.

---

## Notes app workflow on the minimal server path

### First use

1. User opens notes app
2. App works locally immediately
3. User chooses to enable sync
4. User logs into their Haven Lite server
5. App ensures namespace `user/notes-app`
6. App uploads/publishes manifest
7. App begins syncing local changes to the server

### Subsequent use

1. App opens local store immediately
2. App restores session/token
3. App asks server for changes since last cursor
4. App pushes local changes
5. App converges state in background

### User experience goal

This should feel like:

- local app first
- optional sync target second
- no visible backend management

---

## Why this path is a good compromise

It preserves the most important Haven properties:

- local-first behavior
- user-controlled remote sync target
- multiple apps can share one server/account
- no app-specific backend deployment

while avoiding the biggest risks:

- building a full provider too early
- forcing Haven onto a file-oriented substrate that may not fit
- overcommitting to protocol design before real usage

---

## Experiment plan: same notes app on two substrates

The immediate goal is no longer to implement the whole Haven model.

Instead, the goal is to build the **same notes app twice**:

1. notes app on Fireproof
2. notes app on remoteStorage

This experiment should ignore most of the larger Haven protocol for now.

The purpose is to learn from actual behavior:

- online experience
- offline experience
- sync behavior
- reconnect behavior
- developer complexity
- user mental model

The question is:

> which substrate gives the better practical foundation for Haven’s local-first, user-controlled data experience?

---

## Scope of the experiment

The two apps should be as similar as possible.

### Shared app features

Both versions should support:

- create note
- edit note
- delete/archive note
- list notes
- order by last updated
- tags (optional but useful)
- local-first interaction
- sync when online

### Shared UX goals

Both versions should feel like:

- local app first
- no blocking on network for normal note edits
- background sync when possible
- understandable connection/setup flow

### What to defer

Do not include yet:

- Haven manifest protocol beyond what is minimally necessary
- multiple app namespaces
- push notifications
- advanced search
- cross-app integration
- collaboration or sharing

---

## Experiment A: Notes app on Fireproof

### What this should test

- how natural Fireproof feels for local-first document storage
- how much sync behavior comes for free
- how clean offline editing feels
- what kind of sync target is required
- how easy it is to reason about reconnect and merge behavior

### Expected shape

- Fireproof as local database
- minimal sync target as needed
- notes stored as documents
- queries run locally

### Likely strengths

- better local-first behavior
- simpler document model
- cleaner local querying

### Likely risks

- less obvious user-owned provider story
- may still require some sync-target glue

---

## Experiment B: Notes app on remoteStorage

### What this should test

- how strong the user-owned storage experience feels in practice
- whether remoteStorage setup/authorization feels good
- how awkward it is to map a notes app onto file-oriented storage
- how much glue code is needed for sync/indexing/state reconciliation

### Expected shape

- local browser state or local DB in app
- notes serialized to remoteStorage files
- one app-scoped folder
- app handles file sync/reconciliation

### Likely strengths

- strongest provider/account ownership story
- authentic remoteStorage-style UX

### Likely risks

- file-oriented model may be awkward for notes sync
- more custom logic needed for merge/query/index behavior

---

## Comparison criteria

After building both versions, compare them on:

### User experience

- how quickly app becomes usable
- how understandable setup/auth feels
- how visible the storage/provider model is
- how smooth offline behavior feels
- how smooth reconnect feels

### Performance feel

- startup feel
- note create/edit responsiveness
- sync lag when online
- reconnect catch-up behavior

### Reliability

- behavior after going offline mid-edit
- behavior after editing on two devices
- behavior after reconnect
- risk of visible conflicts or lost changes

### Developer experience

- code complexity
- amount of custom sync logic
- amount of substrate-specific glue
- clarity of mental model while building

---

## Suggested test scenarios

Each version should be tested with the same scenarios.

### Scenario 1: Local-first single device

- open app
- create notes offline
- reload app
- verify data persists locally

### Scenario 2: Connect and sync

- connect to sync target
- create/edit notes
- verify they persist remotely

### Scenario 3: Offline edit then reconnect

- disconnect network
- edit several notes
- reconnect
- observe sync behavior

### Scenario 4: Two-device convergence

- open app on device A and device B
- make changes on A
- verify B catches up
- make changes while B is offline
- reconnect B
- observe final state

### Scenario 5: Setup comprehension

- watch how understandable setup feels
- especially for remoteStorage address/provider choice versus Fireproof sync target choice

---

## Expected output of the experiment

At the end, the goal is not merely to say which substrate is “better” in the abstract.

The goal is to answer:

1. Which one feels better for users?
2. Which one feels more natural for local-first app development?
3. Which one better supports Haven’s core identity?
4. Which one requires less custom system-building?

This should drive the next Haven Lite decision.

---

## Working thesis

The current best next step is:

- build the same notes app on Fireproof
- build the same notes app on remoteStorage
- compare real UX and implementation complexity before committing to a substrate

This is a better use of time than designing more protocol or provider infrastructure before real app experience is understood.

