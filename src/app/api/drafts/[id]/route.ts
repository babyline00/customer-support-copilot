import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, json, readJsonBody, logAudit } from '@/lib/server'
import { validateStatusTransition, isTerminalStatus } from '@/lib/draft-status'

export const runtime = 'nodejs'

const ACTION_FOR_STATUS: Record<string, string> = {
  approved: 'approve_draft',
  sent: 'send_draft',
  rejected: 'reject_draft',
}

/**
 * PATCH /api/drafts/[id] — edit a draft's reply content and/or transition its status.
 * Body: { replyContent?, status? }
 * Status transitions are validated against the state machine in draft-status.ts.
 * Agent role can edit replyContent but cannot transition status (RBAC gate below).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = getCurrentUser(req)
  const { id: draftId } = await ctx.params
  const body = await readJsonBody<{ replyContent?: string; status?: string }>(req)
  const draft = await db.draft.findUnique({ where: { id: draftId } })
  if (!draft) return json({ error: 'draft not found' }, 404)

  if (isTerminalStatus(draft.status)) {
    return json({ error: `draft is in terminal status '${draft.status}' and cannot be modified` }, 409)
  }

  const updates: { replyContent?: string; status?: string; updatedAt?: Date } = {}
  let action: string | null = null

  if (typeof body.replyContent === 'string') {
    updates.replyContent = body.replyContent
    if (body.replyContent !== draft.replyContent) action = 'edit_draft'
  }

  if (typeof body.status === 'string' && body.status !== draft.status) {
    // Status transition — RBAC: only admin can approve / send / reject.
    if (user.role !== 'admin') {
      return json({ error: 'forbidden: only admin can transition draft status' }, 403)
    }
    if (!validateStatusTransition(draft.status, body.status)) {
      return json({ error: `invalid status transition: ${draft.status} -> ${body.status}` }, 409)
    }
    updates.status = body.status
    action = ACTION_FOR_STATUS[body.status] ?? action
  }

  if (!Object.keys(updates).length) {
    return json({ draft })
  }

  const updated = await db.draft.update({ where: { id: draftId }, data: updates })
  if (action) {
    await logAudit({
      userId: user.id,
      orgId: draft.orgId,
      action,
      entityId: draft.id,
      entityType: 'Draft',
      metadata: { from: draft.status, to: updates.status ?? draft.status, editedReply: updates.replyContent != null },
    })
  }
  return json({ draft: updated })
}

// DELETE /api/drafts/[id] — remove a draft.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = getCurrentUser(req)
  const { id: draftId } = await ctx.params
  const draft = await db.draft.findUnique({ where: { id: draftId }, select: { id: true, orgId: true, status: true } })
  if (!draft) return json({ error: 'draft not found' }, 404)
  await db.draft.delete({ where: { id: draftId } })
  await logAudit({
    userId: user.id,
    orgId: draft.orgId,
    action: 'delete_draft',
    entityId: draft.id,
    entityType: 'Draft',
    metadata: { priorStatus: draft.status },
  })
  return json({ ok: true })
}
