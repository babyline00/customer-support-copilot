import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json } from '@/lib/server'
import { formatAuditEntry } from '@/lib/audit'

export const runtime = 'nodejs'

// GET /api/orgs/[id]/audit — last 50 audit entries for an org, newest first.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await ctx.params
  const org = await db.organization.findUnique({ where: { id: orgId } })
  if (!org) return json({ error: 'org not found' }, 404)
  const logs = await db.auditLog.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const entries = logs.map((l) => formatAuditEntry(l))
  return json({ entries })
}
