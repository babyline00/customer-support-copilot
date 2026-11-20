import { test, expect, describe } from 'bun:test'
import { formatAuditEntry, shouldLog } from '../audit'

const baseEntry = {
  id: 'log-1',
  userId: 'usr-1',
  action: 'create_draft',
  entityId: 'drf-1',
  entityType: 'Draft',
  orgId: 'org-1',
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
}

describe('formatAuditEntry', () => {
  test('returns a UI-friendly shape with the expected keys', () => {
    const out = formatAuditEntry(baseEntry)
    expect(out.id).toBe('log-1')
    expect(out.userId).toBe('usr-1')
    expect(out.action).toBe('create_draft')
    expect(out.actionLabel).toBe('Drafted reply')
    expect(out.entityId).toBe('drf-1')
    expect(out.entityType).toBe('Draft')
    expect(out.orgId).toBe('org-1')
    expect(out.createdAt).toBe('2025-01-01T00:00:00.000Z')
  })

  test('summary includes the entity type + truncated id', () => {
    const out = formatAuditEntry(baseEntry)
    expect(out.summary).toContain('Drafted reply')
    expect(out.summary).toContain('Draft')
    expect(out.summary).toContain('drf-1'.slice(0, 8))
  })

  test('parses metadata JSON into an object', () => {
    const out = formatAuditEntry({
      ...baseEntry,
      metadata: JSON.stringify({ tone: 'warm', ticketSubject: 'Refund?' }),
    })
    expect(out.metadata).toEqual({ tone: 'warm', ticketSubject: 'Refund?' })
  })

  test('metadata null / unparsable -> null', () => {
    expect(formatAuditEntry({ ...baseEntry, metadata: null }).metadata).toBeNull()
    expect(formatAuditEntry({ ...baseEntry, metadata: 'not-json' }).metadata).toBeNull()
    expect(formatAuditEntry({ ...baseEntry, metadata: '' }).metadata).toBeNull()
  })

  test('falls back to a sensible label for unknown actions', () => {
    const out = formatAuditEntry({ ...baseEntry, action: 'something_new' })
    expect(out.actionLabel).toBe('something_new')
  })

  test('handles a Date or string createdAt', () => {
    const a = formatAuditEntry({ ...baseEntry, createdAt: new Date('2025-06-01T10:00:00.000Z') })
    const b = formatAuditEntry({ ...baseEntry, createdAt: '2025-06-01T10:00:00.000Z' })
    expect(a.createdAt).toBe('2025-06-01T10:00:00.000Z')
    expect(b.createdAt).toBe('2025-06-01T10:00:00.000Z')
  })

  test('entityId / entityType null when absent', () => {
    const out = formatAuditEntry({
      id: 'log-2',
      userId: 'usr-1',
      action: 'login',
      orgId: null,
    })
    expect(out.entityId).toBeNull()
    expect(out.entityType).toBeNull()
    expect(out.orgId).toBeNull()
    expect(out.summary).toBe('Signed in')
  })
})

describe('shouldLog', () => {
  test('returns true for the four queue verbs', () => {
    expect(shouldLog('create')).toBe(true)
    expect(shouldLog('approve')).toBe(true)
    expect(shouldLog('send')).toBe(true)
    expect(shouldLog('reject')).toBe(true)
  })

  test('returns true for the fully-qualified AuditActions', () => {
    expect(shouldLog('create_draft')).toBe(true)
    expect(shouldLog('approve_draft')).toBe(true)
    expect(shouldLog('send_draft')).toBe(true)
    expect(shouldLog('reject_draft')).toBe(true)
    expect(shouldLog('upload_doc')).toBe(true)
    expect(shouldLog('ingest_tickets')).toBe(true)
    expect(shouldLog('create_macro')).toBe(true)
  })

  test('returns false for unknown / empty / read-only actions', () => {
    expect(shouldLog('')).toBe(false)
    expect(shouldLog('view')).toBe(false)
    expect(shouldLog('list')).toBe(false)
    expect(shouldLog('navigate')).toBe(false)
    expect(shouldLog('anything_else')).toBe(false)
  })
})
