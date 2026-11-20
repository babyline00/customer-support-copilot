import { test, expect, describe } from 'bun:test'
import {
  buildSupportReplyPrompt,
  extractCitations,
  getChatProvider,
  __setChatProviderForTest,
  type ChatProvider,
} from '../ai'
import type { RetrievedItem } from '../retrieval'

const retrieved: RetrievedItem[] = [
  {
    id: 'ck-aaa',
    source: 'doc',
    orgId: 'org-1',
    docId: 'doc-1',
    docTitle: 'Refund Policy',
    ordinal: 1,
    heading: '## Eligibility',
    content: 'Refunds are issued within 30 days of purchase for unused subscriptions.',
    bm25Score: 4.2,
    vectorScore: 0.81,
    fusedScore: 0.016,
  },
  {
    id: 'ck-bbb',
    source: 'ticket',
    orgId: 'org-1',
    ticketSubject: 'Refund not received',
    ticketResolution: 'Issued a full refund via Stripe and confirmed with the customer.',
    content: 'Subject: Refund not received\n\nCustomer wrote: I never got my refund.\n\nResolution: Issued a full refund via Stripe and confirmed with the customer.',
    bm25Score: 2.1,
    vectorScore: 0.74,
    fusedScore: 0.012,
  },
]

describe('buildSupportReplyPrompt', () => {
  const org = { name: 'Acme SaaS' }
  const ticket = { subject: 'Where is my refund?', body: 'I asked for a refund 2 weeks ago.' }

  test('includes the org name in the agent role line', () => {
    const { systemPrompt } = buildSupportReplyPrompt(org, ticket, retrieved, 'formal', null)
    expect(systemPrompt).toContain('Acme SaaS')
    expect(systemPrompt.toLowerCase()).toContain('customer support agent')
  })

  test('includes the tone preset instructions', () => {
    const { systemPrompt } = buildSupportReplyPrompt(org, ticket, retrieved, 'apology', null)
    // apology preset begins with "Begin with a sincere apology"
    expect(systemPrompt).toContain('apology')
    expect(systemPrompt.toLowerCase()).toContain('apolog')
  })

  test('includes the style guide when provided', () => {
    const guide = 'Always sign off as "Acme Support". Escalate billing issues to billing@acme.io.'
    const { systemPrompt } = buildSupportReplyPrompt(org, ticket, retrieved, 'warm', guide)
    expect(systemPrompt).toContain('Acme Support')
    expect(systemPrompt).toContain('billing@acme.io')
  })

  test('includes a placeholder style-guide line when none provided', () => {
    const { systemPrompt } = buildSupportReplyPrompt(org, ticket, retrieved, 'casual', null)
    expect(systemPrompt.toLowerCase()).toContain('no style guide')
  })

  test('includes retrieved doc chunks and past tickets with [^c1] markers', () => {
    const { systemPrompt } = buildSupportReplyPrompt(org, ticket, retrieved, 'formal', null)
    expect(systemPrompt).toContain('[^c1]')
    expect(systemPrompt).toContain('[^c2]')
    expect(systemPrompt).toContain('Refund Policy')
    expect(systemPrompt).toContain('Refund not received')
  })

  test('includes the "draft a reply" instruction', () => {
    const { systemPrompt } = buildSupportReplyPrompt(org, ticket, retrieved, 'formal', null)
    expect(systemPrompt.toLowerCase()).toContain('draft a reply')
    expect(systemPrompt.toLowerCase()).toContain('resolves')
  })

  test('handles an empty retrieved array gracefully', () => {
    const { systemPrompt, citationMap } = buildSupportReplyPrompt(org, ticket, [], 'formal', null)
    expect(systemPrompt.toLowerCase()).toContain('no relevant docs')
    expect(Object.keys(citationMap)).toHaveLength(0)
  })

  test('citationMap is keyed by the underlying retrieved item id', () => {
    const { citationMap } = buildSupportReplyPrompt(org, ticket, retrieved, 'formal', null)
    expect(citationMap['ck-aaa'].source).toBe('doc')
    expect(citationMap['ck-bbb'].source).toBe('ticket')
    expect(citationMap['ck-aaa'].label).toContain('Refund Policy')
  })
})

describe('extractCitations', () => {
  test('returns retrieved item ids in citation order', () => {
    const msg = 'Per our policy, refunds are issued within 30 days [^c1]. As we did for a similar case [^c2].'
    const ids = extractCitations(msg, retrieved)
    expect(ids).toEqual(['ck-aaa', 'ck-bbb'])
  })

  test('dedupes repeated citations', () => {
    const msg = 'Per policy [^c1]. Again [^c1].'
    const ids = extractCitations(msg, retrieved)
    expect(ids).toEqual(['ck-aaa'])
  })

  test('ignores out-of-range markers', () => {
    expect(extractCitations('Bogus [^c99].', retrieved)).toEqual([])
  })

  test('no markers -> []', () => {
    expect(extractCitations('no markers here', retrieved)).toEqual([])
  })
})

describe('ChatProvider (mock)', () => {
  class MockChat implements ChatProvider {
    async *stream(args: { systemPrompt: string; messages: { role: string; content: string }[] }) {
      yield 'mocked response for: '
      yield args.messages[args.messages.length - 1].content
    }
  }
  test('streams concatenated deltas', async () => {
    __setChatProviderForTest(new MockChat())
    const provider = getChatProvider()
    const out: string[] = []
    for await (const d of provider.stream({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      out.push(d)
    }
    expect(out.join('')).toBe('mocked response for: hello')
    __setChatProviderForTest(null)
  })
})
