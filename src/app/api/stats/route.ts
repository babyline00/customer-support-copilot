import { db } from '@/lib/db'
import { json } from '@/lib/server'

export const runtime = 'nodejs'

// GET /api/stats — global counts used by the right-sidebar stats card.
export async function GET() {
  const [orgs, docs, tickets, drafts, macros, audit] = await Promise.all([
    db.organization.count(),
    db.doc.count(),
    db.pastTicket.count(),
    db.draft.count(),
    db.macro.count(),
    db.auditLog.count(),
  ])
  const draftsByStatus = await db.draft.groupBy({
    by: ['status'],
    _count: { _all: true },
  })
  const draftsByStatusMap: Record<string, number> = {}
  for (const row of draftsByStatus) {
    draftsByStatusMap[row.status] = row._count._all
  }
  return json({ orgs, docs, tickets, drafts, macros, audit, draftsByStatus: draftsByStatusMap })
}
