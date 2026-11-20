/**
 * Audit log helpers.
 *
 * Every mutating action (create draft, approve, send, reject, upload doc,
 * ingest tickets, create macro) is recorded as an AuditLog row. This module
 * provides the small helpers the API routes share so the audit entry shape is
 * consistent and the list of "loggable" actions lives in one place.
 *
 * RBAC is intentionally simplified for the MVP (admin vs. agent); the action
 * names below are the verbs that appear in the audit trail and in the UI.
 */

export type AuditAction =
  | 'create_org'
  | 'upload_doc'
  | 'delete_doc'
  | 'ingest_tickets'
  | 'create_draft'
  | 'approve_draft'
  | 'send_draft'
  | 'reject_draft'
  | 'edit_draft'
  | 'delete_draft'
  | 'create_macro'
  | 'update_style_guide'
  | 'login'
  | 'logout'

const LOGGABLE_ACTIONS = new Set<AuditAction>([
  'create_org',
  'upload_doc',
  'delete_doc',
  'ingest_tickets',
  'create_draft',
  'approve_draft',
  'send_draft',
  'reject_draft',
  'edit_draft',
  'delete_draft',
  'create_macro',
  'update_style_guide',
])

/**
 * The user-facing actions that flow through the draft approval queue. Used by
 * the UI to decide whether a given draft transition should also write an
 * audit log entry.
 */
const QUEUE_ACTIONS = new Set<string>(['create', 'approve', 'send', 'reject'])

/**
 * Returns true when the given action verb should produce an audit log entry.
 * Accepts the bare verb ("create", "approve", "send", "reject") used in the
 * UI plus the fully-qualified AuditAction names used by the API.
 */
export function shouldLog(action: string): boolean {
  if (!action) return false
  if (QUEUE_ACTIONS.has(action)) return true
  if ((LOGGABLE_ACTIONS as Set<string>).has(action)) return true
  return false
}

export interface AuditEntryInput {
  id: string
  userId: string
  action: string
  entityId?: string | null
  entityType?: string | null
  metadata?: string | null
  orgId?: string | null
  createdAt?: Date | string
}

export interface FormattedAuditEntry {
  id: string
  userId: string
  action: string
  /** Human label for the audit feed UI. */
  actionLabel: string
  entityId: string | null
  entityType: string | null
  /** Parsed metadata object (or null when metadata was empty / unparsable). */
  metadata: Record<string, unknown> | null
  orgId: string | null
  createdAt: string
  /** Short one-line summary suitable for a feed row. */
  summary: string
}

const ACTION_LABELS: Record<string, string> = {
  create_org: 'Created organization',
  upload_doc: 'Uploaded doc',
  delete_doc: 'Deleted doc',
  ingest_tickets: 'Ingested past tickets',
  create_draft: 'Drafted reply',
  approve_draft: 'Approved draft',
  send_draft: 'Sent reply',
  reject_draft: 'Rejected draft',
  edit_draft: 'Edited draft',
  delete_draft: 'Deleted draft',
  create_macro: 'Created macro',
  update_style_guide: 'Updated style guide',
  login: 'Signed in',
  logout: 'Signed out',
}

/** Map a raw AuditLog row into the UI-friendly structure used by the audit feed. */
export function formatAuditEntry(entry: AuditEntryInput): FormattedAuditEntry {
  const raw = entry.metadata ?? ''
  let metadata: Record<string, unknown> | null = null
  if (raw) {
    try {
      metadata = JSON.parse(raw) as Record<string, unknown>
    } catch {
      metadata = null
    }
  }
  const createdAt =
    entry.createdAt instanceof Date
      ? entry.createdAt.toISOString()
      : typeof entry.createdAt === 'string'
        ? entry.createdAt
        : new Date().toISOString()
  const label = ACTION_LABELS[entry.action] ?? entry.action
  const entityPart = entry.entityId ? ` ${entry.entityType ?? 'item'} ${entry.entityId.slice(0, 8)}` : ''
  const summary = `${label}${entityPart}`
  return {
    id: entry.id,
    userId: entry.userId,
    action: entry.action,
    actionLabel: label,
    entityId: entry.entityId ?? null,
    entityType: entry.entityType ?? null,
    metadata,
    orgId: entry.orgId ?? null,
    createdAt,
    summary,
  }
}
