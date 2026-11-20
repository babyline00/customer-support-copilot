import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, json, readJsonBody, logAudit, requireRole } from '@/lib/server'

export const runtime = 'nodejs'

// PATCH /api/orgs/[id] — update the org's style guide (admin only).
// Body: { styleGuide?: string, name?: string }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = getCurrentUser(req)
  // Admin-only guard. requireRole throws a Response on failure — we let it
  // bubble up as the route's response.
  try {
    requireRole(user, 'admin')
  } catch (resp) {
    return resp as Response
  }
  const { id: orgId } = await ctx.params
  const body = await readJsonBody<{ styleGuide?: string; name?: string }>(req)
  const org = await db.organization.findUnique({ where: { id: orgId } })
  if (!org) return json({ error: 'org not found' }, 404)

  const data: { styleGuide?: string; name?: string } = {}
  let action: string | null = null
  if (typeof body.styleGuide === 'string' && body.styleGuide !== org.styleGuide) {
    data.styleGuide = body.styleGuide
    action = 'update_style_guide'
  }
  if (typeof body.name === 'string' && body.name.trim() && body.name !== org.name) {
    data.name = body.name.trim()
  }
  if (!Object.keys(data).length) return json({ org })

  const updated = await db.organization.update({ where: { id: orgId }, data })
  if (action) {
    await logAudit({
      userId: user.id,
      orgId,
      action,
      entityId: org.id,
      entityType: 'Organization',
      metadata: { length: data.styleGuide?.length ?? 0 },
    })
  }
  return json({ org: updated })
}
