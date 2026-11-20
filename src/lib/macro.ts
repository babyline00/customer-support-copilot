/**
 * Suggested macros — pre-canned short replies for common cases.
 *
 * Macros are stored per-org so each tenant curates its own set. Bodies may
 * include `{{customer_name}}`, `{{agent_name}}`, and `{{order_id}}` style
 * placeholders that the agent fills in at send time. This module owns the
 * placeholder substitution so the UI and the API use the same format.
 */

export interface MacroInput {
  id: string
  name: string
  body: string
}

export interface MacroVars {
  customer_name?: string
  agent_name?: string
  order_id?: string
  /** Any extra keys are also substituted as {{key}}. */
  [key: string]: string | undefined
}

/**
 * Replace `{{key}}` placeholders in the macro body with values from `vars`.
 * Unknown placeholders are left untouched (so a typo doesn't strip a token).
 * Whitespace inside the braces is tolerated: `{{ customer_name }}` works.
 */
export function formatMacro(macro: MacroInput, vars: MacroVars = {}): string {
  return macro.body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key: string) => {
    const val = vars[key]
    return typeof val === 'string' && val.length > 0 ? val : full
  })
}

/** List the placeholder names found in a macro body (in order of appearance). */
export function listPlaceholders(body: string): string[] {
  const out: string[] = []
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}

/** Default macros seeded into every new org so the queue is non-empty on day one. */
export const DEFAULT_MACROS: Omit<MacroInput, 'id' | 'orgId'>[] & { name: string; body: string }[] = [
  {
    name: 'Refund issued',
    body:
      'Hi {{customer_name}},\n\nI\'ve issued a full refund for order {{order_id}}. It should land on your original payment method within 5-7 business days. Let me know if you don\'t see it by then.\n\n{{agent_name}}',
  } as any,
  {
    name: 'Account reset',
    body:
      'Hi {{customer_name}},\n\nI\'ve reset your account password. You should receive a secure reset link by email shortly. If you don\'t get it within 10 minutes, let me know and I\'ll resend.\n\n{{agent_name}}',
  } as any,
  {
    name: 'Bug filed',
    body:
      'Hi {{customer_name}},\n\nThanks for the detailed report — I\'ve filed this as a bug with our engineering team and linked your ticket. I\'ll follow up here the moment we ship a fix.\n\n{{agent_name}}',
  } as any,
] as any
