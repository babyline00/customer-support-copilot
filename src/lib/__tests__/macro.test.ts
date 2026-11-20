import { test, expect, describe } from 'bun:test'
import { formatMacro, listPlaceholders } from '../macro'

const refundMacro = {
  id: 'mc-1',
  name: 'Refund issued',
  body:
    'Hi {{customer_name}},\n\nI\'ve issued a full refund for order {{order_id}}. It should land in 5-7 business days.\n\n{{agent_name}}',
}

describe('formatMacro', () => {
  test('fills all known placeholders', () => {
    const out = formatMacro(refundMacro, {
      customer_name: 'Priya',
      order_id: '#12345',
      agent_name: 'Sam',
    })
    expect(out).toContain('Hi Priya,')
    expect(out).toContain('order #12345')
    expect(out).toContain('Sam')
    expect(out).not.toContain('{{')
    expect(out).not.toContain('}}')
  })

  test('leaves unknown placeholders untouched', () => {
    const out = formatMacro(refundMacro, { customer_name: 'Priya' })
    // order_id and agent_name were not provided -> preserved verbatim
    expect(out).toContain('{{order_id}}')
    expect(out).toContain('{{agent_name}}')
    expect(out).toContain('Hi Priya,')
  })

  test('tolerates whitespace inside the braces', () => {
    const out = formatMacro(
      { id: 'x', name: 'test', body: 'Hello {{ customer_name }}!' },
      { customer_name: 'Jo' },
    )
    expect(out).toBe('Hello Jo!')
  })

  test('empty / missing vars leaves all placeholders', () => {
    const out = formatMacro(refundMacro)
    expect(out).toContain('{{customer_name}}')
    expect(out).toContain('{{order_id}}')
    expect(out).toContain('{{agent_name}}')
  })

  test('returns the body unchanged when there are no placeholders', () => {
    const plain = { id: 'x', name: 'plain', body: 'Hello there.' }
    expect(formatMacro(plain, { customer_name: 'x' })).toBe('Hello there.')
  })

  test('empty string values are treated as missing', () => {
    const out = formatMacro(refundMacro, { customer_name: '', order_id: '#1', agent_name: 'A' })
    // empty customer_name falls back to the literal placeholder
    expect(out).toContain('{{customer_name}}')
    expect(out).toContain('#1')
    expect(out).toContain('A')
  })
})

describe('listPlaceholders', () => {
  test('returns unique placeholder names in order of appearance', () => {
    const names = listPlaceholders(refundMacro.body)
    expect(names).toEqual(['customer_name', 'order_id', 'agent_name'])
  })

  test('dedupes repeated placeholders', () => {
    const names = listPlaceholders('Hi {{x}} and {{x}} again, also {{y}}')
    expect(names).toEqual(['x', 'y'])
  })

  test('returns [] when no placeholders present', () => {
    expect(listPlaceholders('plain text, nothing to fill')).toEqual([])
  })
})
