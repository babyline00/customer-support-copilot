import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json } from '@/lib/server'

export const runtime = 'nodejs'

// GET /api/orgs/[id]/tickets — list past tickets for an org (most recent first).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await ctx.params
  const org = await db.organization.findUnique({ where: { id: orgId } })
  if (!org) return json({ error: 'org not found' }, 404)
  const tickets = await db.pastTicket.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, subject: true, body: true, resolution: true, createdAt: true },
  })
  return json({ tickets })
}
