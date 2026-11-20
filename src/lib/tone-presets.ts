/**
 * Tone presets for support reply drafting.
 *
 * Each preset wraps the LLM system prompt with a tone-specific instruction and
 * ships with one short example so a reviewer can preview the tone without
 * triggering an LLM call. The preset is selected by the agent when creating a
 * draft and is stored on the Draft row for audit traceability.
 *
 * The presets are intentionally narrow — they steer style, not substance. The
 * substantive grounding (org docs + past tickets + style guide) is layered on
 * top by `buildSupportReplyPrompt` in `ai.ts`.
 */

export type TonePreset = 'formal' | 'casual' | 'warm' | 'apology'

export interface TonePresetDefinition {
  /** Stable identifier persisted on the Draft row. */
  id: TonePreset
  /** Human label for the picker UI. */
  label: string
  /** One-line tone description injected into the system prompt. */
  systemPrompt: string
  /** A short illustrative reply so a reviewer can preview the tone. */
  example: string
}

export const TONE_PRESETS: Record<TonePreset, TonePresetDefinition> = {
  formal: {
    id: 'formal',
    label: 'Formal',
    systemPrompt:
      'Use a formal, professional tone. Address the customer as "you" and refer to the company in the third person. Avoid contractions and colloquialisms. Keep sentences concise and technically precise.',
    example:
      'Dear customer, thank you for contacting us. We have reviewed your request and applied the configuration change to your account. Please allow up to fifteen minutes for the change to propagate. Should you require further assistance, do not hesitate to reach out. Kind regards, Support Team.',
  },
  casual: {
    id: 'casual',
    label: 'Casual',
    systemPrompt:
      'Use a friendly, conversational tone — like a helpful teammate on chat. Contractions are welcome. Keep it short and direct. Avoid corporate jargon.',
    example:
      "Hey! Good news — I just flipped the switch on your account, so you should be all set. Give it a few minutes and you'll see the change. Ping me if anything else comes up. Cheers!",
  },
  warm: {
    id: 'warm',
    label: 'Warm',
    systemPrompt:
      'Use a warm, empathetic tone that acknowledges the customer\'s effort and feelings. Thank them for their patience. Be reassuring but stay grounded in the facts.',
    example:
      "Thank you so much for your patience while we sorted this out — I know it took a few rounds and I really appreciate you sticking with us. I've gone ahead and applied the fix on our side, so you should be all set now. Let me know if anything else comes up!",
  },
  apology: {
    id: 'apology',
    label: 'Apology',
    systemPrompt:
      'Begin with a sincere apology that acknowledges the specific impact. Take ownership on behalf of the company (use "we"). Explain what happened in plain language, what we did to fix it, and what we will do to prevent recurrence. Do not over-promise.',
    example:
      "I'm truly sorry for the disruption this caused you — we dropped the ball on the renewal reminder and that's on us. I've extended your subscription by 7 days to make up for the lapse, and I've flagged the reminder bug with our engineering team so it won't slip again. Thank you for bearing with us.",
  },
}

export const TONE_PRESET_LIST: TonePresetDefinition[] = Object.values(TONE_PRESETS)

/** Parse an arbitrary string into a TonePreset, defaulting to `formal`. */
export function parseTonePreset(value: unknown): TonePreset {
  if (typeof value === 'string' && value in TONE_PRESETS) {
    return value as TonePreset
  }
  return 'formal'
}
