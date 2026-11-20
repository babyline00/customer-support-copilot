import { test, expect, describe } from 'bun:test'
import {
  validateStatusTransition,
  isTerminalStatus,
  isValidStatus,
  DRAFT_STATUSES,
} from '../draft-status'

describe('validateStatusTransition', () => {
  test('draft -> approved is valid', () => {
    expect(validateStatusTransition('draft', 'approved')).toBe(true)
  })
  test('approved -> sent is valid', () => {
    expect(validateStatusTransition('approved', 'sent')).toBe(true)
  })
  test('draft -> rejected is valid', () => {
    expect(validateStatusTransition('draft', 'rejected')).toBe(true)
  })
  test('approved -> rejected is valid (an approver can pull a draft)', () => {
    expect(validateStatusTransition('approved', 'rejected')).toBe(true)
  })

  test('draft -> sent is INVALID (must approve first)', () => {
    expect(validateStatusTransition('draft', 'sent')).toBe(false)
  })
  test('sent -> anything is INVALID (terminal)', () => {
    expect(validateStatusTransition('sent', 'draft')).toBe(false)
    expect(validateStatusTransition('sent', 'approved')).toBe(false)
    expect(validateStatusTransition('sent', 'rejected')).toBe(false)
    expect(validateStatusTransition('sent', 'sent')).toBe(false)
  })
  test('rejected -> anything is INVALID (terminal)', () => {
    expect(validateStatusTransition('rejected', 'draft')).toBe(false)
    expect(validateStatusTransition('rejected', 'approved')).toBe(false)
    expect(validateStatusTransition('rejected', 'sent')).toBe(false)
  })
  test('self transitions are invalid', () => {
    expect(validateStatusTransition('draft', 'draft')).toBe(false)
    expect(validateStatusTransition('approved', 'approved')).toBe(false)
  })
  test('unknown source / target status is invalid', () => {
    expect(validateStatusTransition('draft', 'bogus')).toBe(false)
    expect(validateStatusTransition('bogus', 'approved')).toBe(false)
    expect(validateStatusTransition('', 'approved')).toBe(false)
    expect(validateStatusTransition('draft', '')).toBe(false)
  })
})

describe('isTerminalStatus', () => {
  test('sent and rejected are terminal', () => {
    expect(isTerminalStatus('sent')).toBe(true)
    expect(isTerminalStatus('rejected')).toBe(true)
  })
  test('draft and approved are not terminal', () => {
    expect(isTerminalStatus('draft')).toBe(false)
    expect(isTerminalStatus('approved')).toBe(false)
  })
})

describe('isValidStatus', () => {
  test('recognises all four statuses', () => {
    expect(isValidStatus('draft')).toBe(true)
    expect(isValidStatus('approved')).toBe(true)
    expect(isValidStatus('sent')).toBe(true)
    expect(isValidStatus('rejected')).toBe(true)
  })
  test('rejects unknown values', () => {
    expect(isValidStatus('pending')).toBe(false)
    expect(isValidStatus('')).toBe(false)
  })
})

describe('DRAFT_STATUSES', () => {
  test('exports all four statuses', () => {
    expect(DRAFT_STATUSES).toEqual(['draft', 'approved', 'sent', 'rejected'])
  })
})
