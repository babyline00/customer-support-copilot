import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, json, logAudit } from '@/lib/server'
import { invalidateOrgCorpus } from '@/lib/retrieval'

export const runtime = 'nodejs'

// DELETE /api/docs/[id] — remove a doc and cascade its chunks.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = getCurrentUser(req)
  const { id: docId } = await ctx.params
  const doc = await db.doc.findUnique({ select: { id: true, orgId: true, title: true }, where: { id: docId } })
  if (!doc) return json({ error: 'doc not found' }, 404)
  await db.doc.delete({ where: { id: docId } })
  invalidateOrgCorpus(doc.orgId)
  await logAudit({
    userId: user.id,
    orgId: doc.orgId,
    action: 'delete_doc',
    entityId: doc.id,
    entityType: 'Doc',
    metadata: { title: doc.title },
  })
  return json({ ok: true })
}
