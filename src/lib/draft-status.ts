/**
 * Draft status state machine.
 *
 * A draft progresses through a small lifecycle:
 *
 *   draft ──approve──▶ approved ──send──▶ sent
 *   draft ──reject───▶ rejected
 *   approved ──reject──▶ rejected     (an approver can pull a draft)
 *   sent / rejected are terminal
 *
 * Agents can edit `replyContent` and create drafts but cannot transition a
 * draft to `approved`, `sent`, or `rejected` — those transitions are admin
 * only. The API enforces that separation; this module only owns the transition
 * validity table.
 */

export type DraftStatus = 'draft' | 'approved' | 'sent' | 'rejected'

export const DRAFT_STATUSES: DraftStatus[] = ['draft', 'approved', 'sent', 'rejected']

/**
 * Allowed forward transitions. Anything not listed is invalid.
 *
 * Note that `sent` and `rejected` are terminal — they do not appear as a
 * source state.
 */
const TRANSITIONS: Record<string, DraftStatus[]> = {
  draft: ['approved', 'rejected'],
  approved: ['sent', 'rejected'],
  sent: [],
  rejected: [],
}

/** True when `from -> to` is a permitted status transition. */
export function validateStatusTransition(from: string, to: string): boolean {
  if (!from || !to) return false
  const allowed = TRANSITIONS[from]
  if (!allowed) return false
  return allowed.includes(to as DraftStatus)
}

/** True when the status is terminal (no further transitions are possible). */
export function isTerminalStatus(status: string): boolean {
  return status === 'sent' || status === 'rejected'
}

/** True when the status is a known DraftStatus value. */
export function isValidStatus(status: string): status is DraftStatus {
  return (DRAFT_STATUSES as string[]).includes(status)
}
