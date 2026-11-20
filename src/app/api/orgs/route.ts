import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, json, readJsonBody, logAudit } from '@/lib/server'

export const runtime = 'nodejs'

// GET /api/orgs — list all organizations.
export async function GET() {
  const orgs = await db.organization.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      styleGuide: true,
      createdAt: true,
      _count: { select: { docs: true, tickets: true, drafts: true, macros: true } },
    },
  })
  return json({ orgs })
}

// POST /api/orgs — create an organization.
export async function POST(req: NextRequest) {
  const user = getCurrentUser(req)
  const body = await readJsonBody<{ name?: string; slug?: string; styleGuide?: string }>(req)
  const name = (body.name ?? '').trim()
  const slug = (body.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
  if (!name || !slug) {
    return json({ error: 'name and slug are required' }, 400)
  }
  const existing = await db.organization.findUnique({ where: { slug } })
  if (existing) {
    return json({ error: 'slug already in use' }, 409)
  }
  const org = await db.organization.create({
    data: { name, slug, styleGuide: body.styleGuide ?? null },
  })
  await logAudit({
    userId: user.id,
    orgId: org.id,
    action: 'create_org',
    entityId: org.id,
    entityType: 'Organization',
    metadata: { name, slug },
  })
  return json({ org }, 201)
}
