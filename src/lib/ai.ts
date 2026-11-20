/**
 * Support reply draft generation.
 *
 * Wraps the z-ai-web-dev-sdk chat completion endpoint with a retrieval-
 * augmented system prompt that grounds each drafted reply in (a) the org's
 * knowledge-base docs and (b) past resolved tickets, plus the org's style
 * guide and a tone preset selected by the agent.
 *
 * The LLM is instructed to cite each retrieved item inline using `[^c1]`
 * footnote-style markers (same convention as Project #1's RAG assistant)
 * so the draft detail view can render a citations panel beneath the reply.
 *
 * The `ChatProvider` interface is identical to Project #1's so the same
 * pluggable / mockable streaming design carries over. The retrieval types
 * are multi-tenant aware (every RetrievedItem carries an `orgId`).
 */

import type { RetrievedItem } from '@/lib/retrieval'
import { TONE_PRESETS, type TonePreset } from '@/lib/tone-presets'

export interface ChatProvider {
  /** Returns an async generator of text deltas. */
  stream(args: {
    systemPrompt: string
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  }): AsyncGenerator<string, void, unknown>
}

let cachedProvider: ChatProvider | null = null

class ZaiProvider implements ChatProvider {
  async *stream(args: {
    systemPrompt: string
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  }): AsyncGenerator<string, void, unknown> {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const messages = [
      { role: 'system' as const, content: args.systemPrompt },
      ...args.messages,
    ]
    const completion = await zai.chat.completions.create({
      messages,
      stream: true,
      thinking: { type: 'disabled' },
    })

    if (typeof completion === 'string') {
      yield completion
      return
    }
    let body: ReadableStream<Uint8Array> | undefined
    if (completion && typeof (completion as any).getReader === 'function') {
      body = completion as ReadableStream<Uint8Array>
    } else {
      body = (completion as any)?.body ?? (completion as any)?._body
    }
    if (!body) {
      const content = (completion as any)?.choices?.[0]?.message?.content
      if (typeof content === 'string' && content.length > 0) yield content
      return
    }
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') return
        try {
          const obj = JSON.parse(payload)
          const delta = obj?.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta.length > 0) yield delta
        } catch {
          // ignore partial JSON
        }
      }
    }
  }
}

class MockProvider implements ChatProvider {
  async *stream(args: {
    systemPrompt: string
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  }): AsyncGenerator<string, void, unknown> {
    const lastUser = [...args.messages].reverse().find((m) => m.role === 'user')
    const text = lastUser?.content ?? ''
    yield `[mock assistant] You asked: "${text.slice(0, 140)}". ` +
      `(No live LLM configured — set the SDK env vars to enable real reply generation.)`
  }
}

export function getChatProvider(): ChatProvider {
  if (cachedProvider) return cachedProvider
  if (process.env.CSC_DISABLE_LLM === '1') {
    cachedProvider = new MockProvider()
    return cachedProvider
  }
  try {
    cachedProvider = new ZaiProvider()
  } catch (e) {
    console.warn('[chat] ZaiProvider unavailable, using MockProvider:', (e as Error).message)
    cachedProvider = new MockProvider()
  }
  return cachedProvider
}

/** Test-only. */
export function __setChatProviderForTest(p: ChatProvider | null) {
  cachedProvider = p
}

export interface SupportOrg {
  name: string
}

export interface SupportTicket {
  subject: string
  body: string
}

export interface CitationEntry {
  /** Short label, e.g. "Doc › Refund policy" or "Past ticket › Refund not received". */
  label: string
  /** Source kind: 'doc' or 'ticket'. */
  source: 'doc' | 'ticket'
  /** Preview of the cited content (first ~140 chars, single-line). */
  preview: string
}

/**
 * Build the system prompt that grounds a support reply draft.
 *
 * Includes (verified by ai.test.ts):
 *  - the org name ("You are a customer support agent for <org>")
 *  - tone instructions derived from the chosen preset
 *  - the org's style guide (if present)
 *  - the retrieved doc chunks and past tickets, each tagged with a [^cN]
 *    citation marker
 *  - the "draft a reply that resolves the ticket" instruction
 *
 * Returns the system prompt plus a citation map keyed by the underlying
 * retrieved item id so the UI can render a citations panel.
 */
export function buildSupportReplyPrompt(
  org: SupportOrg,
  ticket: SupportTicket,
  retrieved: RetrievedItem[],
  tonePreset: TonePreset,
  styleGuide: string | null,
): { systemPrompt: string; citationMap: Record<string, CitationEntry> } {
  const tone = TONE_PRESETS[tonePreset] ?? TONE_PRESETS.formal
  const citationMap: Record<string, CitationEntry> = {}
  const chunkLines: string[] = []

  retrieved.forEach((item, i) => {
    const shortId = `c${i + 1}`
    const label =
      item.source === 'doc'
        ? `Doc "${item.docTitle ?? 'untitled'}"${item.heading ? ` › ${item.heading}` : ''} (chunk ${item.ordinal ?? '?'})`
        : `Past ticket "${item.ticketSubject ?? 'untitled'}"`
    chunkLines.push(`[^${shortId}]: (id=${item.id}, source=${item.source}) ${label}\n${item.content}`)
    citationMap[item.id] = {
      label,
      source: item.source,
      preview: item.content.slice(0, 140).replace(/\s+/g, ' ').trim(),
    }
  })

  const retrievedBlock =
    retrieved.length > 0
      ? `Retrieved context (cite every factual claim with [^c1], [^c2], ...):\n\n${chunkLines.join('\n\n---\n\n')}`
      : 'No relevant docs or past tickets were retrieved for this ticket — draft a reply using general best practices and offer to follow up.'

  const styleGuideBlock = styleGuide && styleGuide.trim().length > 0
    ? `Style guide for ${org.name}:\n${styleGuide.trim()}`
    : `No style guide has been set for ${org.name}.`

  const systemPrompt = [
    `You are a customer support agent for ${org.name}.`,
    `Tone: ${tone.id}. ${tone.systemPrompt}`,
    styleGuideBlock,
    '',
    'Rules:',
    '1. Draft a reply that resolves the customer\'s ticket. Be specific and actionable — do not punt to "please wait" without a concrete next step.',
    '2. Ground every factual claim in the retrieved context above. If the answer is not in the context, say so honestly rather than fabricating a policy.',
    '3. Cite sources inline using [^c1], [^c2], ... markers that match the labels above. Every policy, fee, SLA, or process statement MUST carry a citation.',
    '4. Do not invent quotes from the customer. Do not promise refunds, credits, or SLAs that are not in the retrieved context or style guide.',
    '5. Use plain markdown. Keep the reply focused — one short greeting, the resolution, and a one-line offer of further help.',
    '',
    retrievedBlock,
  ].join('\n')

  return { systemPrompt, citationMap }
}

/**
 * Map short citation markers like [^c1] in the drafted reply back to the
 * retrieved item ids. Returns an ordered list of unique ids actually cited.
 */
export function extractCitations(message: string, retrieved: RetrievedItem[]): string[] {
  const seen = new Set<string>()
  const re = /\[\^(c\d+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(message)) !== null) {
    const idx = parseInt(m[1].slice(1), 10) - 1
    if (idx >= 0 && idx < retrieved.length) {
      seen.add(retrieved[idx].id)
    }
  }
  return Array.from(seen)
}
