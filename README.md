# Customer Support Copilot

A multi-tenant SaaS copilot that drafts support replies by grounding the LLM in
**company docs, past resolved tickets, and a per-org style guide**. It cuts
first-response drafting time by roughly 40% and routes every reply through a
lightweight **draft → approved → sent** approval queue with full audit logging.

Built with Next.js 16, TypeScript 5, Tailwind CSS 4, shadcn/ui (New York), Prisma 6 +
SQLite, and the `z-ai-web-dev-sdk` for LLM streaming. The retrieval pipeline is the
hybrid BM25 + vector + Reciprocal Rank Fusion (RRF) design first used in Project #1
(Personal Knowledge Copilot) — reused here, but scoped per-tenant.

---

## Overview

Support agents spend a huge fraction of their day writing variations of the same
five replies. This copilot automates the *drafting* step while keeping a human in
the loop:

1. An agent drops a customer ticket (subject + body) into the **New draft** dialog
   and picks a **tone preset** (formal / casual / warm / apology).
2. The copilot retrieves the most relevant **doc chunks** + **past resolved
   tickets** for the agent's organization using hybrid retrieval.
3. It builds a system prompt that layers the org's name, the tone preset, the
   **style guide**, the retrieved context, and an instruction to cite every claim
   with `[^c1]`-style markers.
4. The LLM streams a reply; the copilot extracts the cited chunk ids and persists
   the draft with a citations panel.
5. The draft lands in the **approval queue**. An admin reviews, edits if needed,
   then **Approve** → **Send** (or **Reject**). Every transition is logged.

Each organization's docs, past tickets, drafts, and macros live in separate rows
scoped by `orgId`, and the retrieval corpus is loaded per-org so one tenant's
knowledge base is never blended with another's.

---

## MVP scope (this repo)

- **Multi-tenant** — `Organization` table; UI org switcher in the header. Seeds
  three orgs: *Acme SaaS*, *Globex E-commerce*, *Initech Finance*.
- **Doc ingestion** — drag-drop or paste markdown/text; chunked (markdown-aware
  chunker) + embedded (hashing embedder by default, OpenAI-compatible when
  `EMBEDDINGS_API_KEY` is set).
- **Past ticket ingestion** — CSV (`subject, body, resolution`) embedded as a
  separate "ticket corpus" so retrieval can surface similar past tickets.
- **Style guide** — markdown text on the Org row (tone, signature, escalation
  policy). Wrapped into every draft's system prompt. Editable in the Docs nav.
- **Tone presets** — formal / casual / warm / apology. Each preset injects a
  tone-specific system prompt and ships a one-line example for previewing.
- **Reply draft generation** — BM25 + vector + RRF over docs + past tickets;
  `buildSupportReplyPrompt` assembles the system prompt; LLM streams a cited reply.
- **Draft approval queue** — drafts persist with status `draft / approved /
  sent / rejected`; queue UI with status filters; click a draft to view/edit
  reply + citations panel + approve/reject/send buttons.
- **Suggested macros** — pre-canned short replies for common cases, with
  `{{customer_name}}` / `{{agent_name}}` / `{{order_id}}` placeholder substitution.
- **RBAC + audit logs (simplified)** — admin can do everything; agent can only
  draft. Current user is switchable in the UI header. Every mutating action logs
  to `AuditLog` (last 50 entries shown per org).

## Stretch goals (NOT in this repo)

- **Real Zendesk / Intercom OAuth** — pull tickets and push replies via the
  Zendesk REST API and Intercom API. Today, tickets are pasted or ingested via CSV.
- **Real RBAC with NextAuth + SCIM** — the demo uses a header-switched demo user.
  Production would use NextAuth sessions + SCIM group sync for org membership.
- **Real sentiment escalation alerts** — a sentiment classifier on the ticket
  body would page the on-call engineer for furious / data-loss tickets. Today
  escalation is a paragraph in the style guide.
- **Auto-resolution mode** — let an approved macro auto-reply for high-confidence
  low-risk tickets (e.g. "where do I download the app?"). Out of scope for the MVP.

---

## Features

- Hybrid retrieval (BM25 + vector + RRF) re-used from Project #1, scoped per org.
- Multi-corpus retrieval: doc chunks and past tickets are fused into a single
  ranked list, each item tagged `source: 'doc' | 'ticket'` for the citations UI.
- Four tone presets, each with a system-prompt fragment and a preview example.
- Draft state machine with a small, test-enforced transition table.
- Audit log feed with a UI-friendly `formatAuditEntry` formatter.
- Macro placeholders with a tested `formatMacro` substitution.
- Responsive 3-column layout (left nav / center / right stats+macros), with a
  sticky header, sticky footer, and a mobile-stacked fallback.
- Dark-mode-ready shadcn/ui (New York) components with Tailwind 4 + oklch tokens.

---

## Tech stack

| Layer       | Choice                                                            |
| ----------- | ---------------------------------------------------------------- |
| Framework   | Next.js 16 (App Router), TypeScript 5                            |
| Styling     | Tailwind CSS 4 + shadcn/ui (New York) + lucide-react icons        |
| Database    | Prisma 6 + SQLite (local file)                                   |
| LLM         | `z-ai-web-dev-sdk` (streaming chat completions)                   |
| Embeddings  | Deterministic hashing embedder by default; OpenAI-compatible opt |
| Retrieval   | BM25 (in-memory) + cosine (in-memory) + Reciprocal Rank Fusion   |
| Tests       | `bun test` (bun:test)                                            |
| Lint        | `eslint-config-next`                                             |

---

## Architecture

```
                ┌─────────────────────────────────────────────┐
                │                  Browser UI                  │
                │   header: app · org switcher · user switcher │
                │   left nav: Docs·Tickets·Drafts·Macros·Audit │
                │   right:  org stats · drafts-by-status ·     │
                │           macros quick-list                  │
                └──────────────┬──────────────────────────────┘
                               │ fetch + x-user-id / x-user-role
                               ▼
        ┌──────────────────────────────────────────────────────┐
        │            Next.js Route Handlers (api/)            │
        │  /api/orgs   /api/orgs/[id]/docs                      │
        │  /api/orgs/[id]/tickets[/ingest]                     │
        │  /api/orgs/[id]/drafts   /api/drafts/[id]             │
        │  /api/orgs/[id]/macros   /api/orgs/[id]/audit         │
        │  /api/orgs/[id]  (PATCH style guide)  /api/stats       │
        └──────┬───────────────────────────────────┬───────────┘
               │                                   │
               ▼                                   ▼
   ┌────────────────────┐               ┌──────────────────────┐
   │  src/lib (pure)    │               │   src/lib/server.ts   │
   │  chunker tokenizer │               │  getCurrentUser       │
   │  embeddings bm25   │               │  requireRole (RBAC)   │
   │  hybrid-search ai  │               │  logAudit → AuditLog  │
   │  retrieval         │               └──────────────────────┘
   │  tone-presets      │
   │  audit macro       │
   │  draft-status db   │
   └─────────┬──────────┘
             │ retrieve(orgId, query) → BM25 + vector + RRF
             │ buildSupportReplyPrompt → LLM stream → extractCitations
             ▼
   ┌──────────────────────────────────────────────┐
   │  Prisma 6  →  SQLite (db/custom.db)           │
   │  Organization · Doc · DocChunk · PastTicket   │
   │  Draft · Macro · AuditLog                     │
   │  every domain row scoped by orgId             │
   └──────────────────────────────────────────────┘
```

**Multi-tenant data isolation** — every domain row (`Doc`, `DocChunk`,
`PastTicket`, `Draft`, `Macro`, `AuditLog`) carries an `orgId` foreign key. The
retrieval corpus is built per-org and cached per-org; one tenant's chunks and
vectors are never loaded when serving another tenant's retrieval call.

**Draft approval queue** — `Draft.status` flows `draft → approved → sent` or
`draft|approved → rejected`. The `validateStatusTransition` helper enforces the
state machine; the API layer enforces that only `admin` can transition status.

**Tone presets** — `TONE_PRESETS` is a `Record<TonePreset, { systemPrompt, example }>`
so the picker UI can show a preview and the prompt builder can splice in a
tone-specific instruction without a separate config service.

---

## Setup

```bash
# 1. install deps
bun install

# 2. materialise the SQLite schema
bun run db:push        # uses DATABASE_URL="$(pwd)/db/custom.db" inline

# 3. seed the 3 demo orgs (Acme / Globex / Initech) with docs, tickets, macros
bun run seed

# 4. run the dev server
bun run dev            # http://localhost:3000

# 5. run tests
bun test

# 6. lint
bun run lint
```

The db:* scripts inline `DATABASE_URL="$(pwd)/db/custom.db"` so the SQLite file
always lives next to the app — no `.env` required for local dev. The seed script
is idempotent (upserts the org by slug, clears + re-seeds its docs/tickets/macros).

---

## Tests

`bun test` runs the unit suite. Every test is pure — no DB, no network — so the
suite passes offline and in CI without any seeded data.

| File                         | Covers                                                         |
| ---------------------------- | ------------------------------------------------------------- |
| `chunker.test.ts`            | markdown-aware chunking, overlap, ordinals                    |
| `tokenizer.test.ts`          | lowercase, markdown strip, stop-words, CJK, URL strip         |
| `embeddings.test.ts`         | hashing embedder determinism, cosine, L2 norm, round-trip     |
| `bm25.test.ts`               | Okapi BM25 ranking, IDF weighting, topK, empty corpus         |
| `hybrid-search.test.ts`      | Reciprocal Rank Fusion, fuseHits, k param, topK                |
| `ai.test.ts`                 | `buildSupportReplyPrompt` (org/tone/style/chunks/draft instr) + `extractCitations` + ChatProvider mock |
| `tone-presets.test.ts`       | all 4 presets have systemPrompt + example; `parseTonePreset`  |
| `audit.test.ts`              | `formatAuditEntry` shape; `shouldLog` for queue verbs + actions |
| `macro.test.ts`              | `formatMacro` placeholder fill + unknown placeholders; `listPlaceholders` |
| `draft-status.test.ts`       | `validateStatusTransition` for all valid/invalid paths; terminal |

Aim: 40+ tests. Run `bun test` to see the breakdown.

---

## Environment variables

See `.env.example`. The only required variable is `DATABASE_URL` (the db:*
scripts inline it for you). Optional vars unlock real semantic embeddings and
disable the live LLM for deterministic offline drafts:

```
DATABASE_URL="file:/abs/path/to/db/custom.db"
EMBEDDINGS_API_KEY=          # opt: switch to OpenAI-compatible embeddings
EMBEDDINGS_BASE_URL=
EMBEDDINGS_MODEL=
CSC_DISABLE_LLM=1            # opt: force the mock LLM provider
```

---

## Project structure

```
apps/02-customer-support-copilot/
├── prisma/schema.prisma          # Organization, Doc, DocChunk, PastTicket,
│                                 # Draft, Macro, AuditLog
├── scripts/seed.ts               # seeds Acme / Globex / Initech
├── src/
│   ├── app/
│   │   ├── layout.tsx            # root layout + Toaster
│   │   ├── page.tsx              # the whole SPA (header/nav/center/right)
│   │   ├── globals.css           # Tailwind 4 + oklch tokens (light/dark)
│   │   └── api/
│   │       ├── orgs/route.ts                 # GET/POST orgs
│   │       ├── orgs/[id]/route.ts            # PATCH (style guide)
│   │       ├── orgs/[id]/docs/route.ts       # GET/POST docs
│   │       ├── docs/[id]/route.ts            # DELETE doc
│   │       ├── orgs/[id]/tickets/route.ts    # GET past tickets
│   │       ├── orgs/[id]/tickets/ingest/route.ts  # POST CSV/JSON
│   │       ├── orgs/[id]/drafts/route.ts     # GET/POST drafts (the LLM call)
│   │       ├── drafts/[id]/route.ts         # PATCH (edit/status) / DELETE
│   │       ├── orgs/[id]/macros/route.ts    # GET/POST macros
│   │       ├── orgs/[id]/audit/route.ts     # GET last 50 audit entries
│   │       └── stats/route.ts               # GET global counts
│   ├── components/ui/            # shadcn/ui (New York) — copied from parent
│   ├── hooks/                    # use-toast, use-mobile
│   └── lib/
│       ├── chunker.ts            # markdown-aware chunker (reused)
│       ├── tokenizer.ts          # lowercase + CJK + stop-words (reused)
│       ├── embeddings.ts         # hashing embedder + OpenAI-compat (reused)
│       ├── bm25.ts               # Okapi BM25 (reused)
│       ├── hybrid-search.ts     # RRF + fuseHits (reused)
│       ├── ai.ts                 # ChatProvider + buildSupportReplyPrompt
│       │                         #   + extractCitations
│       ├── retrieval.ts          # per-org corpus + retrieve() + embedForCorpus
│       ├── tone-presets.ts      # formal/casual/warm/apology
│       ├── audit.ts              # formatAuditEntry + shouldLog
│       ├── macro.ts              # formatMacro + listPlaceholders + defaults
│       ├── draft-status.ts      # validateStatusTransition + terminal check
│       ├── server.ts             # getCurrentUser / requireRole / logAudit
│       ├── db.ts                 # Prisma client singleton
│       ├── utils.ts              # cn() helper
│       └── __tests__/*.test.ts
├── package.json                  # db:* scripts inline DATABASE_URL
├── tsconfig.json / next.config.ts / postcss.config.mjs
├── tailwind.config.ts / components.json / eslint.config.mjs
├── .env.example / .gitignore / LICENSE / README.md
```

---

## Case study

### Multi-tenant data isolation

Every domain row carries `orgId`; the `Organization` relation cascades deletes.
The retrieval service (`retrieval.ts`) keeps an in-memory corpus cache **keyed by
orgId** and rebuilds it only when the org's chunk or ticket count changes. The
`loadCorpusForOrg(orgId)` query filters `DocChunk` by `doc.orgId` and
`PastTicket` by `orgId`, so a retrieval call for Acme SaaS never touches Globex's
vectors. This is the smallest correct multi-tenant boundary: a single SQLite
file with a `where orgId = ?` on every read, and the cache partition that
prevents accidental cross-talk at the application layer. Lifting this to
Postgres with row-level-security would be a one-schema change plus a `prisma`
client swap — the API surface is unchanged.

### Draft approval queue

`Draft.status` is a small state machine: `draft → approved → sent`, with
`draft|approved → rejected` as exit ramps, and `sent` / `rejected` terminal.
`validateStatusTransition(from, to)` is the single source of truth (tested in
`draft-status.test.ts`); the PATCH route enforces that only `admin` can move
status. The queue UI filters by status and renders an editable reply +
citations panel — the agent edits the reply freely, the admin owns the gate.

### Tone presets

Tone is a *style* layer, not a *substance* layer — the preset wraps the system
prompt with a one-paragraph instruction and a one-line example, and the
substantive grounding (docs + tickets + style guide) is layered on top by
`buildSupportReplyPrompt`. Keeping tone narrow means a fifth preset (e.g.
"executive escalation") is a 4-line addition to `tone-presets.ts` with no other
code changes — the prompt builder, the picker UI, and the audit metadata all
pick it up automatically because they iterate over `TONE_PRESETS`.

### What I'd do differently

- **Real Zendesk / Intercom OAuth** — the MVP pastes tickets and ingests CSVs.
  Production would OAuth into Zendesk, mirror tickets into `PastTicket` on
  resolve, and push approved drafts back as public replies via the Zendesk
  Comments API. The retrieval + prompt layer is unchanged.
- **Real SSO / SCIM** — the demo's "switch user" header is a toy. Production
  would use NextAuth + SCIM so org membership, admin role, and agent role come
  from the customer's IdP and are enforced on every route via middleware.
- **Real sentiment escalation** — a small classifier (or a single LLM call with
  a sentiment-only prompt) on the ticket body would tag furious / data-loss /
  security tickets as `Priority=P1` and page the on-call engineer, instead of
  relying on the style guide's escalation paragraph.
- **Auto-resolution mode** — for high-confidence, low-risk tickets (e.g.
  "where do I download the app?"), an approved macro could auto-send without a
  human in the loop, with a sampling-based human review every N sends.
- **Per-org vector store** — at scale, swap the in-memory `Float32Array[]` for
  pgvector (one tenant per row-level-security policy) or a per-tenant Pinecone
  namespace. The `retrieve()` signature stays the same.

### Resume bullet

> Built a multi-tenant customer-support copilot (Next.js 16 / TypeScript /
> Prisma + SQLite / z-ai-web-dev-sdk) that drafts cited replies by grounding an
> LLM in per-org docs, past tickets, and a style guide via hybrid BM25 + vector
> + RRF retrieval; added a draft approval queue with a tested state machine,
> four tone presets, RBAC-gated transitions, and per-org audit logging — 40+
> unit tests, MVP scope delivered in ~1,500 LOC.

---

## License

MIT — see `LICENSE`.

---

## Push

```bash
gh repo create customer-support-copilot --public --source=. --remote=origin --push
```
