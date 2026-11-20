import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, json, readJsonBody, logAudit } from '@/lib/server'

export const runtime = 'nodejs'

// GET /api/orgs/[id]/macros — list macros for an org.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await ctx.params
  const org = await db.organization.findUnique({ where: { id: orgId } })
  if (!org) return json({ error: 'org not found' }, 404)
  const macros = await db.macro.findMany({
    where: { orgId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, body: true, createdAt: true },
  })
  return json({ macros })
}

// POST /api/orgs/[id]/macros — create a macro. Body: { name, body }.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = getCurrentUser(req)
  const { id: orgId } = await ctx.params
  const body = await readJsonBody<{ name?: string; body?: string }>(req)
  const name = (body.name ?? '').trim()
  const macroBody = (body.body ?? '').trim()
  if (!name || !macroBody) return json({ error: 'name and body are required' }, 400)
  const org = await db.organization.findUnique({ where: { id: orgId } })
  if (!org) return json({ error: 'org not found' }, 404)
  const macro = await db.macro.create({ data: { orgId, name, body: macroBody } })
  await logAudit({
    userId: user.id,
    orgId,
    action: 'create_macro',
    entityId: macro.id,
    entityType: 'Macro',
    metadata: { name },
  })
  return json({ macro }, 201)
}
