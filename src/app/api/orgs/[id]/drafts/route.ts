import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, json, readJsonBody, logAudit } from '@/lib/server'
import { retrieve, invalidateOrgCorpus } from '@/lib/retrieval'
import { buildSupportReplyPrompt, extractCitations, getChatProvider } from '@/lib/ai'
import { parseTonePreset } from '@/lib/tone-presets'
import { isValidStatus } from '@/lib/draft-status'

export const runtime = 'nodejs'

// GET /api/orgs/[id]/drafts?status=draft|approved|sent|rejected — list drafts.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await ctx.params
  const status = req.nextUrl.searchParams.get('status')
  const where: { orgId: string; status?: string } = { orgId }
  if (status && isValidStatus(status)) where.status = status
  const drafts = await db.draft.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      ticketSubject: true,
      ticketBody: true,
      replyContent: true,
      tonePreset: true,
      status: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  return json({ drafts })
}

/**
 * POST /api/orgs/[id]/drafts — generate a draft reply.
 * Body: { ticketSubject, ticketBody, tonePreset? }
 *
 * Pipeline:
 *   1. retrieve(orgId, "subject body") -> RetrievedItem[]
 *   2. buildSupportReplyPrompt(org, ticket, retrieved, tonePreset, styleGuide)
 *   3. getChatProvider().stream({ systemPrompt, messages:[{role:'user', content: ticket}] })
 *   4. collect full reply text
 *   5. extractCitations(reply, retrieved) -> cited item ids
 *   6. persist Draft row + audit log
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = getCurrentUser(req)
  const { id: orgId } = await ctx.params
  const body = await readJsonBody<{ ticketSubject?: string; ticketBody?: string; tonePreset?: string }>(req)
  const ticketSubject = (body.ticketSubject ?? '').trim()
  const ticketBody = (body.ticketBody ?? '').trim()
  if (!ticketSubject || !ticketBody) {
    return json({ error: 'ticketSubject and ticketBody are required' }, 400)
  }
  const org = await db.organization.findUnique({ where: { id: orgId } })
  if (!org) return json({ error: 'org not found' }, 404)

  const tonePreset = parseTonePreset(body.tonePreset)
  const query = `${ticketSubject}\n${ticketBody}`
  const retrieved = await retrieve(orgId, query, { topK: 6 })
  const { systemPrompt, citationMap } = buildSupportReplyPrompt(
    { name: org.name },
    { subject: ticketSubject, body: ticketBody },
    retrieved,
    tonePreset,
    org.styleGuide,
  )

  // Collect the streamed reply into a single string.
  const provider = getChatProvider()
  let reply = ''
  try {
    for await (const delta of provider.stream({
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Customer ticket:\nSubject: ${ticketSubject}\n\n${ticketBody}\n\nDraft a reply that resolves this ticket, citing the retrieved context with [^c1], [^c2], ... markers.`,
        },
      ],
    })) {
      reply += delta
    }
  } catch (e) {
    return json({ error: 'LLM stream failed', detail: (e as Error).message }, 502)
  }
  if (!reply.trim()) {
    reply = '(The model returned an empty reply. Try again, or check that the LLM provider is configured.)'
  }

  const citedIds = extractCitations(reply, retrieved)
  const citations = citedIds.map((id) => {
    const c = citationMap[id]
    const item = retrieved.find((r) => r.id === id)
    return {
      id,
      label: c?.label ?? id,
      source: c?.source ?? item?.source ?? 'doc',
      preview: c?.preview ?? item?.content.slice(0, 140) ?? '',
    }
  })

  const draft = await db.draft.create({
    data: {
      orgId,
      ticketSubject,
      ticketBody,
      replyContent: reply,
      citations: JSON.stringify(citations),
      tonePreset,
      status: 'draft',
      createdBy: user.id,
    },
  })
  await logAudit({
    userId: user.id,
    orgId,
    action: 'create_draft',
    entityId: draft.id,
    entityType: 'Draft',
    metadata: { tonePreset, retrievedCount: retrieved.length, citedCount: citedIds.length },
  })
  invalidateOrgCorpus(orgId) // not strictly needed, but cheap
  return json({
    draft,
    retrieved: retrieved.map((r) => ({
      id: r.id,
      source: r.source,
      docTitle: r.docTitle,
      ticketSubject: r.ticketSubject,
      heading: r.heading,
      content: r.content,
      fusedScore: r.fusedScore,
    })),
    citations,
  }, 201)
}
