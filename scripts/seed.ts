/**
 * Seed script — creates 3 demo organizations (Acme SaaS, Globex E-commerce,
 * Initech Finance) each with sample docs, past resolved tickets, and a set of
 * suggested macros. Idempotent: re-running clears and re-seeds by slug.
 *
 * Run:  bun run scripts/seed.ts
 *   (or) DATABASE_URL="..." bun run scripts/seed.ts
 *
 * The script does NOT call prisma db push — run `bun run db:push` first to
 * materialise the schema against the configured SQLite file.
 */

import { PrismaClient } from '@prisma/client'
import { chunkMarkdown } from '../src/lib/chunker'
import { tokenize } from '../src/lib/tokenizer'
import { hashingEmbed, serializeVector } from '../src/lib/embeddings'

const db = new PrismaClient()

// ---------- sample content --------------------------------------------------

const acmeDocs = [
  {
    title: 'Refund Policy',
    content: `# Refund Policy

## Eligibility
Refunds are issued within 30 days of purchase for unused subscriptions. Annual plans are pro-rated.

## How to request a refund
Customers should email billing@acme.io from the address on file. Include the original invoice number and the reason for the refund.

## Processing time
Refunds appear on the original payment method within 5-7 business days. Stripe-initiated refunds are visible immediately in the Stripe dashboard.

## Non-refundable items
Add-on seats that have been used to send messages, and one-time setup fees, are non-refundable.`,
  },
  {
    title: 'Account Reset Runbook',
    content: `# Account Reset Runbook

## When to reset
Reset a customer's password only when they have explicitly requested it and verified their identity (email + a recent invoice number).

## Steps
1. Generate a secure reset link in the admin console under Users › Reset.
2. Send the link to the verified email. The link expires in 10 minutes.
3. Confirm the customer successfully set a new password.
4. If they don't get the link within 10 minutes, resend once, then escalate to #team-platform.

## What NOT to do
Never reveal the existing password hash. Never reset 2FA without a second verification factor.`,
  },
  {
    title: 'SLA and Escalation',
    content: `# SLA and Escalation

## First response
All tickets get a first response within 4 business hours. Premium plan customers get a 1-hour first-response SLA.

## Resolution
Standard plan: 1 business day. Premium: 4 business hours. Escalations go to the on-call engineer via #oncall-support in Slack.

## When to escalate
Escalate immediately if a customer mentions data loss, security, or a paid tier being down. Mark the ticket Priority=P1 and page the on-call.`,
  },
]

const acmeTickets = [
  {
    subject: 'Refund not received after 2 weeks',
    body: 'I requested a refund on the 1st and still haven\'t seen it on my card.',
    resolution:
      'Confirmed the refund was initiated on our side but the customer\'s bank had flagged it. Re-issued via Stripe and asked the customer to call their bank. Refund landed 3 days later.',
  },
  {
    subject: 'Can\'t log in after enabling 2FA',
    body: 'I set up 2FA and now I can\'t get into my account. Help!',
    resolution:
      'Verified identity via email + recent invoice. Disabled 2FA via the admin console and sent a fresh 2FA setup link. Customer re-enabled it and confirmed login worked.',
  },
  {
    subject: 'Billing doubled this month',
    body: 'My invoice is twice what it usually is.',
    resolution:
      'Found two seats had been added by a teammate. Removed the extra seats, issued a credit for the difference, and explained how seat management works in the billing page.',
  },
]

const globexDocs = [
  {
    title: 'Shipping & Returns',
    content: `# Shipping & Returns

## Shipping windows
Domestic orders ship within 1 business day and arrive in 3-5 business days. International orders take 7-14 business days depending on the destination.

## Returns
Returns are accepted within 60 days of delivery for unworn items in original packaging. The customer pays return shipping unless the item was defective.

## Damaged in transit
If an item arrives damaged, the customer should reply with photos within 7 days. We issue a replacement or a full refund, no return required.`,
  },
  {
    title: 'Loyalty Program FAQ',
    content: `# Loyalty Program FAQ

## How points are earned
Customers earn 1 point per $1 spent. Bonus categories (electronics, seasonal sales) earn 2 points per $1.

## Redeeming points
500 points = $10 off. 1000 points = $25 off. Points expire 24 months after they are earned.

## Tier upgrades
Silver at 5,000 points, Gold at 15,000 points. Gold members get free return shipping and early access to sales.`,
  },
]

const globexTickets = [
  {
    subject: 'My package arrived damaged',
    body: 'The box was crushed and the item inside is broken. Photos attached.',
    resolution:
      'Reviewed photos, confirmed damage in transit. Shipped a replacement same-day and issued a $10 loyalty credit for the inconvenience. No return required for the damaged item.',
  },
  {
    subject: 'Why didn\'t my loyalty points post?',
    body: 'I made a big order last week and my points balance hasn\'t moved.',
    resolution:
      'Points had been held pending the return window. Confirmed the return window closed, manually posted the 1,250 points, and explained the 60-day hold policy.',
  },
]

const initechDocs = [
  {
    title: 'Wire Transfer Instructions',
    content: `# Wire Transfer Instructions

## Domestic wires
Initech Finance accepts domestic wires to account 0011-2233-4455, routing 021000021, beneficiary "Initech Finance LLC". Wires post same business day if received by 2pm ET.

## International wires
Use SWIFT code INITECH33. Include the customer reference number on the wire memo. International wires take 1-3 business days to post.

## Wire investigation
If a wire hasn't posted within 3 business days, open a ticket with the wire reference number. We escalate to our correspondent bank and reply within 1 business day.`,
  },
  {
    title: 'Compliance & KYC',
    content: `# Compliance & KYC

## Identity verification
All new accounts must complete KYC before any deposit is accepted. Required documents: government photo ID, proof of address (utility bill), and a selfie liveness check.

## Enhanced due diligence
Accounts above $50,000 in monthly volume are flagged for EDD: source-of-funds documentation and a brief call with a compliance officer.

## What we cannot do
We cannot release funds on an account with an open KYC flag. We cannot waive the selfie check under any circumstance.`,
  },
]

const initechTickets = [
  {
    subject: 'Wire not posting after 4 days',
    body: 'I sent a wire last Monday and it still isn\'t in my account.',
    resolution:
      'Pulled the wire trace with our correspondent bank — the sender's bank had used a wrong reference. Re-mapped the wire to the customer's account and confirmed the funds posted. Followed up to ensure correct reference format for next time.',
  },
  {
    subject: 'KYC document keeps getting rejected',
    body: 'I\'ve uploaded my driver\'s license three times and it keeps failing.',
    resolution:
      'The image was too low-resolution to read the edge text. Sent clear photo guidelines and a secure upload link. Customer re-uploaded; KYC cleared within an hour.',
  },
]

const orgSeed = [
  {
    name: 'Acme SaaS',
    slug: 'acme-saas',
    styleGuide:
      '# Tone\nWe are warm but precise. We take ownership ("I will..." not "We will look into it").\n# Signature\nSign every reply as "The Acme Support Team".\n# Escalation\nEscalate anything mentioning data loss, security, or a paid tier being down to billing@acme.io and page #oncall-support.',
    docs: acmeDocs,
    tickets: acmeTickets,
    macros: [
      { name: 'Refund issued', body: 'Hi {{customer_name}},\n\nI\'ve issued a full refund for invoice {{order_id}}. It should land on your original payment method within 5-7 business days.\n\nThe Acme Support Team' },
      { name: 'Account reset', body: 'Hi {{customer_name}},\n\nI\'ve reset your account password. You should receive a secure reset link by email shortly.\n\nThe Acme Support Team' },
      { name: 'Bug filed', body: 'Hi {{customer_name}},\n\nThanks for the detailed report — I\'ve filed this as a bug with engineering and linked your ticket. I\'ll follow up here the moment we ship a fix.\n\nThe Acme Support Team' },
    ],
  },
  {
    name: 'Globex E-commerce',
    slug: 'globex-ecommerce',
    styleGuide:
      '# Tone\nFriendly, casual, enthusiastic — we sell fun products. Contractions welcome.\n# Signature\nSign as "Globex Customer Joy Team".\n# Escalation\nDamaged-in-transit or wrong-item-shipped cases get a $10 loyalty credit + replacement, no manager approval needed.',
    docs: globexDocs,
    tickets: globexTickets,
    macros: [
      { name: 'Replacement shipped', body: 'Hi {{customer_name}}!\n\nSo sorry about the mix-up — I\'ve shipped a replacement for order {{order_id}} and it\'s on the way. We\'ve also dropped a $10 loyalty credit on your account. 💛\n\nGlobex Customer Joy Team' },
      { name: 'Loyalty points posted', body: 'Hi {{customer_name}}!\n\nGood catch — I\'ve manually posted your missing loyalty points for order {{order_id}}. Your balance is updated. Happy shopping!\n\nGlobex Customer Joy Team' },
    ],
  },
  {
    name: 'Initech Finance',
    slug: 'initech-finance',
    styleGuide:
      '# Tone\nFormal, precise, compliance-first. Address the customer as "Mr./Ms. <surname>" unless they have asked otherwise. Never speculate about regulatory outcomes.\n# Signature\nSign as "Initech Finance Client Services".\n# Escalation\nAny wire > $100k that hasn\'t posted in 24h must be escalated to the wire desk and the compliance officer on duty. Do NOT promise a posting time until the trace is confirmed.',
    docs: initechDocs,
    tickets: initechTickets,
    macros: [
      { name: 'Wire trace opened', body: 'Dear {{customer_name}},\n\nWe have opened a wire trace for reference {{order_id}} with our correspondent bank. We will reply within one business day with the trace result.\n\nInitech Finance Client Services' },
      { name: 'KYC re-upload', body: 'Dear {{customer_name}},\n\nYour KYC submission could not be read clearly. Please re-upload a high-resolution photo of your document with all four corners visible.\n\nInitech Finance Client Services' },
    ],
  },
]

// ---------- helpers --------------------------------------------------------

async function embedText(text: string): Promise<{ tokens: string; embedding: string }> {
  return {
    tokens: JSON.stringify(tokenize(text)),
    embedding: serializeVector(hashingEmbed(text)),
  }
}

async function seedOrg(seed: (typeof orgSeed)[number]) {
  const org = await db.organization.upsert({
    where: { slug: seed.slug },
    update: { name: seed.name, styleGuide: seed.styleGuide },
    create: { name: seed.name, slug: seed.slug, styleGuide: seed.styleGuide },
  })

  // wipe existing docs/tickets/macros for a clean re-seed
  await db.doc.deleteMany({ where: { orgId: org.id } })
  await db.pastTicket.deleteMany({ where: { orgId: org.id } })
  await db.macro.deleteMany({ where: { orgId: org.id } })

  for (const d of seed.docs) {
    const chunks = chunkMarkdown(d.content)
    const created = await db.doc.create({
      data: { orgId: org.id, title: d.title, content: d.content },
    })
    for (const c of chunks) {
      const { tokens, embedding } = await embedText(c.content)
      await db.docChunk.create({
        data: {
          docId: created.id,
          ordinal: c.ordinal,
          heading: c.heading,
          content: c.content,
          tokens,
          embedding,
        },
      })
    }
  }

  for (const t of seed.tickets) {
    const text = `${t.subject} ${t.body} ${t.resolution}`
    const { tokens, embedding } = await embedText(text)
    await db.pastTicket.create({
      data: {
        orgId: org.id,
        subject: t.subject,
        body: t.body,
        resolution: t.resolution,
        tokens,
        embedding,
      },
    })
  }

  for (const m of seed.macros) {
    await db.macro.create({ data: { orgId: org.id, name: m.name, body: m.body } })
  }

  console.log(`Seeded "${seed.name}" (slug=${seed.slug}): ${seed.docs.length} docs, ${seed.tickets.length} past tickets, ${seed.macros.length} macros`)
}

// ---------- main -----------------------------------------------------------

async function main() {
  console.log('Seeding Customer Support Copilot demo data…')
  for (const seed of orgSeed) {
    await seedOrg(seed)
  }
  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
