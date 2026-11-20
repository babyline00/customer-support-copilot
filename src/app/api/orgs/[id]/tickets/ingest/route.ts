import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, json, readJsonBody, logAudit } from '@/lib/server'
import { tokenize } from '@/lib/tokenizer'
import { getEmbeddingProvider, serializeVector } from '@/lib/embeddings'
import { invalidateOrgCorpus } from '@/lib/retrieval'

export const runtime = 'nodejs'

interface IngestRow {
  subject?: string
  body?: string
  resolution?: string
}

/**
 * Parse a CSV blob with the columns subject,body,resolution. Naive parser —
 * the seed data and demo uploads are well-formed; we only need to handle
 * quoted fields with embedded commas and escaped double-quotes.
 */
function parseCsv(text: string): IngestRow[] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        cur.push(field)
        field = ''
      } else if (ch === '\n') {
        cur.push(field)
        rows.push(cur)
        cur = []
        field = ''
      } else if (ch === '\r') {
        // ignore
      } else {
        field += ch
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field)
    rows.push(cur)
  }
  if (!rows.length) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const sIdx = header.indexOf('subject')
  const bIdx = header.indexOf('body')
  const rIdx = header.indexOf('resolution')
  const out: IngestRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (r.length < 3) continue
    out.push({
      subject: sIdx >= 0 ? r[sIdx] : r[0],
      body: bIdx >= 0 ? r[bIdx] : r[1],
      resolution: rIdx >= 0 ? r[rIdx] : r[2],
    })
  }
  return out
}

/**
 * POST /api/orgs/[id]/tickets/ingest
 * Body: { tickets: [{ subject, body, resolution }] } OR { csv: "subject,body,resolution\n…" }
 * Embeds each ticket and stores it as a PastTicket row.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = getCurrentUser(req)
  const { id: orgId } = await ctx.params
  const contentType = req.headers.get('content-type') ?? ''
  let rows: IngestRow[] = []

  if (contentType.includes('text/csv')) {
    const text = await req.text()
    rows = parseCsv(text)
  } else {
    const body = await readJsonBody<{ tickets?: IngestRow[]; csv?: string }>(req)
    if (body.csv) {
      rows = parseCsv(body.csv)
    } else if (Array.isArray(body.tickets)) {
      rows = body.tickets
    }
  }

  rows = rows
    .map((r) => ({
      subject: (r.subject ?? '').trim(),
      body: (r.body ?? '').trim(),
      resolution: (r.resolution ?? '').trim(),
    }))
    .filter((r) => r.subject && r.body && r.resolution)

  if (!rows.length) return json({ error: 'no valid tickets provided (need subject, body, resolution)' }, 400)
  const org = await db.organization.findUnique({ where: { id: orgId } })
  if (!org) return json({ error: 'org not found' }, 404)

  const provider = getEmbeddingProvider()
  let created = 0
  for (const r of rows) {
    const text = `${r.subject} ${r.body} ${r.resolution}`
    const vec = await provider.embed(text)
    await db.pastTicket.create({
      data: {
        orgId,
        subject: r.subject,
        body: r.body,
        resolution: r.resolution,
        tokens: JSON.stringify(tokenize(text)),
        embedding: serializeVector(vec),
      },
    })
    created++
  }
  invalidateOrgCorpus(orgId)
  await logAudit({
    userId: user.id,
    orgId,
    action: 'ingest_tickets',
    entityId: null,
    entityType: 'PastTicket',
    metadata: { count: created },
  })
  return json({ ingested: created }, 201)
}
