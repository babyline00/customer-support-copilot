/**
 * Server-side helpers shared by the API routes: lightweight "current user"
 * resolution (the demo UI sends the selected user via headers — no real
 * auth session), role gating, and a thin audit-log writer.
 *
 * This module is server-only — it imports the Prisma client. It MUST NOT be
 * imported by any pure lib module that is also imported from the test suite.
 */

import { db } from '@/lib/db'
import { shouldLog } from '@/lib/audit'

export type UserRole = 'admin' | 'agent'

export interface CurrentUser {
  id: string
  name: string
  role: UserRole
}

const DEFAULT_USER: CurrentUser = { id: 'demo-admin', name: 'Demo Admin', role: 'admin' }

/**
 * Read the "current user" from request headers. The demo UI lets you switch
 * between a seeded admin and a seeded agent; the choice is propagated as
 * `x-user-id` and `x-user-role` headers on every fetch. Missing headers fall
 * back to the default admin so the API works when hit from curl.
 */
export function getCurrentUser(req: Request): CurrentUser {
  const id = req.headers.get('x-user-id')
  const role = req.headers.get('x-user-role')
  const name = req.headers.get('x-user-name')
  if (!id || !role) return DEFAULT_USER
  if (role !== 'admin' && role !== 'agent') return DEFAULT_USER
  return {
    id,
    role,
    name: name ?? id,
  }
}

/** Throw a 403 Response when the current user's role is not allowed. */
export function requireRole(user: CurrentUser, role: UserRole): void {
  if (user.role !== role) {
    throw new Response(JSON.stringify({ error: `forbidden: requires ${role} role` }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })
  }
}

export interface AuditInput {
  userId: string
  orgId?: string | null
  action: string
  entityId?: string | null
  entityType?: string | null
  metadata?: Record<string, unknown> | null
}

/** Persist an AuditLog row. No-op when the action is not loggable. */
export async function logAudit(input: AuditInput): Promise<void> {
  if (!shouldLog(input.action)) return
  await db.auditLog.create({
    data: {
      userId: input.userId,
      orgId: input.orgId ?? null,
      action: input.action,
      entityId: input.entityId ?? null,
      entityType: input.entityType ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  })
}

/** Convenience JSON response helper. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Read a JSON body safely, returning {} on parse failure. */
export async function readJsonBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const text = await req.text()
    if (!text) return {} as T
    return JSON.parse(text) as T
  } catch {
    return {} as T
  }
}
