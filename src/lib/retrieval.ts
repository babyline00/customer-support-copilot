/**
 * Org-scoped hybrid retrieval over two corpora: doc chunks and past tickets.
 *
 * For a given organization we load its DocChunk rows and PastTicket rows into
 * an in-memory corpus, build a BM25 index, and keep the serialised vectors so
 * cosine similarity can be computed in app code. Retrieval is then BM25 +
 * vector + RRF — the same pipeline as Project #1, but the corpus is built per
 * org so one tenant's knowledge base is never mixed with another's.
 *
 * The corpus cache is keyed by orgId and invalidated when chunks/tickets are
 * added or removed for that org.
 */

import { db } from '@/lib/db'
import { tokenize } from '@/lib/tokenizer'
import { BM25Index } from '@/lib/bm25'
import {
  getEmbeddingProvider,
  cosine,
  deserializeVector,
  serializeVector,
  type EmbeddingProvider,
} from '@/lib/embeddings'
import { fuseHits } from '@/lib/hybrid-search'

export type ItemSource = 'doc' | 'ticket'

export interface RetrievedItem {
  id: string // chunkId or ticketId
  source: ItemSource
  orgId: string
  // doc-specific
  docId?: string
  docTitle?: string
  ordinal?: number
  heading?: string
  // ticket-specific
  ticketSubject?: string
  ticketResolution?: string
  // common
  content: string
  bm25Score: number
  vectorScore: number
  fusedScore: number
}

const TOP_K = 6

interface CorpusRow {
  id: string
  source: ItemSource
  docId?: string
  docTitle?: string
  ordinal?: number
  heading?: string
  ticketSubject?: string
  ticketResolution?: string
  content: string
  tokens: string[]
  vector: Float32Array
}

interface CorpusState {
  orgId: string
  rows: CorpusRow[]
  bm25: BM25Index
  signature: string
}

const corpusCache = new Map<string, CorpusState>()

async function signatureFor(orgId: string): Promise<string> {
  const [chunks, tickets] = await Promise.all([
    db.docChunk.count({ where: { doc: { orgId } } }),
    db.pastTicket.count({ where: { orgId } }),
  ])
  return `${orgId}:${chunks}:${tickets}`
}

async function loadCorpusForOrg(orgId: string, provider: EmbeddingProvider): Promise<CorpusState> {
  const [chunks, tickets] = await Promise.all([
    db.docChunk.findMany({
      where: { doc: { orgId } },
      include: { doc: { select: { title: true } } },
      orderBy: { ordinal: 'asc' },
    }),
    db.pastTicket.findMany({ where: { orgId } }),
  ])

  const rows: CorpusRow[] = []

  for (const c of chunks) {
    let tokens: string[]
    try {
      tokens = JSON.parse(c.tokens) as string[]
    } catch {
      tokens = tokenize(c.content)
    }
    let vector: Float32Array
    try {
      vector = deserializeVector(c.embedding)
    } catch {
      vector = await provider.embed(c.content)
    }
    rows.push({
      id: c.id,
      source: 'doc',
      orgId,
      docId: c.docId,
      docTitle: c.doc.title,
      ordinal: c.ordinal,
      heading: c.heading,
      content: c.content,
      tokens,
      vector,
    })
  }

  for (const t of tickets) {
    let tokens: string[]
    try {
      tokens = JSON.parse(t.tokens) as string[]
    } catch {
      tokens = tokenize(`${t.subject} ${t.body} ${t.resolution}`)
    }
    let vector: Float32Array
    try {
      vector = deserializeVector(t.embedding)
    } catch {
      vector = await provider.embed(`${t.subject} ${t.body} ${t.resolution}`)
    }
    rows.push({
      id: t.id,
      source: 'ticket',
      orgId,
      ticketSubject: t.subject,
      ticketResolution: t.resolution,
      content: `Subject: ${t.subject}\n\nCustomer wrote:\n${t.body}\n\nResolution:\n${t.resolution}`,
      tokens,
      vector,
    })
  }

  return {
    orgId,
    rows,
    bm25: new BM25Index(rows.map((r) => ({ id: r.id, tokens: r.tokens }))),
    signature: await signatureFor(orgId),
  }
}

async function getCorpusForOrg(orgId: string): Promise<CorpusState> {
  const sig = await signatureFor(orgId)
  const cached = corpusCache.get(orgId)
  if (cached && cached.signature === sig) return cached
  const provider = getEmbeddingProvider()
  const state = await loadCorpusForOrg(orgId, provider)
  corpusCache.set(orgId, state)
  return state
}

/** Drop the cached corpus for an org so the next retrieve() call reloads. */
export function invalidateOrgCorpus(orgId: string): void {
  corpusCache.delete(orgId)
}

/** Drop all cached corpora (used after a bulk import). */
export function invalidateAllCorpora(): void {
  corpusCache.clear()
}

export interface RetrieveOptions {
  topK?: number
}

/**
 * Hybrid retrieval over the org's doc chunks + past tickets. Returns the top-K
 * RetrievedItems ordered by fused (RRF) score.
 */
export async function retrieve(
  orgId: string,
  query: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedItem[]> {
  const topK = opts.topK ?? TOP_K
  const corpus = await getCorpusForOrg(orgId)
  if (!corpus.rows.length) return []

  const bm25Hits = corpus.bm25.search(query, topK * 2)

  const provider = getEmbeddingProvider()
  const qVec = await provider.embed(query)
  const vecHits = corpus.rows
    .map((r) => ({ id: r.id, score: cosine(qVec, r.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK * 2)

  const fused = fuseHits(bm25Hits, vecHits, { topK })
  const byId = new Map(corpus.rows.map((r) => [r.id, r]))
  const out: RetrievedItem[] = []
  for (const f of fused) {
    const row = byId.get(f.id)
    if (!row) continue
    out.push({
      id: row.id,
      source: row.source,
      orgId: row.orgId,
      docId: row.docId,
      docTitle: row.docTitle,
      ordinal: row.ordinal,
      heading: row.heading,
      ticketSubject: row.ticketSubject,
      ticketResolution: row.ticketResolution,
      content: row.content,
      bm25Score: f.bm25Score,
      vectorScore: f.vectorScore,
      fusedScore: f.fusedScore,
    })
  }
  return out
}

/** Stats for an org — used by the right-sidebar stats card. */
export async function orgCorpusStats(orgId: string): Promise<{
  docs: number
  chunks: number
  tickets: number
}> {
  const [docs, chunks, tickets] = await Promise.all([
    db.doc.count({ where: { orgId } }),
    db.docChunk.count({ where: { doc: { orgId } } }),
    db.pastTicket.count({ where: { orgId } }),
  ])
  return { docs, chunks, tickets }
}

/** Helper for the ingestion routes — returns the serialised vector + tokens for storage. */
export async function embedForCorpus(
  text: string,
): Promise<{ tokens: string; embedding: string }> {
  const provider = getEmbeddingProvider()
  const vec = await provider.embed(text)
  return {
    tokens: JSON.stringify(tokenize(text)),
    embedding: serializeVector(vec),
  }
}
