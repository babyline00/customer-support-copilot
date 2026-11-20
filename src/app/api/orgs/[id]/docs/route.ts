import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, json, readJsonBody, logAudit } from '@/lib/server'
import { chunkMarkdown } from '@/lib/chunker'
import { tokenize } from '@/lib/tokenizer'
import { getEmbeddingProvider, serializeVector } from '@/lib/embeddings'
import { invalidateOrgCorpus } from '@/lib/retrieval'

export const runtime = 'nodejs'

// GET /api/orgs/[id]/docs — list docs for an org with chunk counts.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await ctx.params
  const org = await db.organization.findUnique({ where: { id: orgId } })
  if (!org) return json({ error: 'org not found' }, 404)
  const docs = await db.doc.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { chunks: true } } },
  })
  return json({
    docs: docs.map((d) => ({ id: d.id, title: d.title, content: d.content, createdAt: d.createdAt, chunkCount: d._count.chunks })),
  })
}

// POST /api/orgs/[id]/docs — upload a doc (markdown / text). Body: { title, content }.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = getCurrentUser(req)
  const { id: orgId } = await ctx.params
  const body = await readJsonBody<{ title?: string; content?: string }>(req)
  const title = (body.title ?? '').trim()
  const content = (body.content ?? '').trim()
  if (!title || !content) return json({ error: 'title and content are required' }, 400)
  const org = await db.organization.findUnique({ where: { id: orgId } })
  if (!org) return json({ error: 'org not found' }, 404)

  const provider = getEmbeddingProvider()
  const chunks = chunkMarkdown(content)
  const doc = await db.doc.create({ data: { orgId, title, content } })
  for (const c of chunks) {
    const vec = await provider.embed(c.content)
    await db.docChunk.create({
      data: {
        docId: doc.id,
        ordinal: c.ordinal,
        heading: c.heading,
        content: c.content,
        tokens: JSON.stringify(tokenize(c.content)),
        embedding: serializeVector(vec),
      },
    })
  }
  invalidateOrgCorpus(orgId)
  await logAudit({
    userId: user.id,
    orgId,
    action: 'upload_doc',
    entityId: doc.id,
    entityType: 'Doc',
    metadata: { title, chunks: chunks.length },
  })
  return json({ doc: { id: doc.id, title, chunkCount: chunks.length } }, 201)
}
