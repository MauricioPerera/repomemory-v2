/**
 * Domain 3: "Customer Support" — Mixed languages, corrections + profile
 * Tests correction boost, profile injection, and cross-lingual recall
 */
import type { BenchmarkDomain } from '../types.js';

export const customerSupportDomain: BenchmarkDomain = {
  name: 'CustomerSupport',
  description: 'Customer support with corrections and user profile (mixed languages)',
  agentId: 'ctt-bench-agent',
  userId: 'support-agent',
  seedData: {
    memories: [
      {
        content: 'Customer ACME Corp is on the Enterprise plan ($499/month). Primary contact: Sarah Chen (sarah@acme.com). Account since January 2024.',
        tags: ['acme', 'enterprise', 'customer', 'subscription'],
        category: 'fact',
      },
      {
        content: 'ACME Corp reported an issue with PDF export — files over 50MB fail silently. Escalated to engineering team. Ticket #4521.',
        tags: ['acme', 'bug', 'pdf', 'export'],
        category: 'issue',
      },
      {
        content: 'WRONG: ACME Corp refund policy allows refunds within 15 days.',
        tags: ['acme', 'refund', 'policy'],
        category: 'fact',
      },
      {
        content: 'CORRECTION: ACME Corp refund policy allows refunds within 30 days, not 15. Updated per new agreement signed 2024-11-01.',
        tags: ['acme', 'refund', 'policy', 'supersedes:mem-wrong-refund'],
        category: 'correction',
      },
      {
        content: 'El cliente TechLatam prefiere comunicación en español. Están en el plan Pro ($99/mes). Contacto: Carlos Ruiz (carlos@techlatam.io).',
        tags: ['techlatam', 'pro', 'spanish', 'customer'],
        category: 'fact',
      },
      {
        content: 'TechLatam requested API access for their internal dashboard. Approved — API key generated 2024-12-01. Quota: 5000 requests/day.',
        tags: ['techlatam', 'api', 'access'],
        category: 'fact',
      },
    ],
    skills: [
      {
        content: 'Refund process: 1) Verify customer identity 2) Check refund eligibility (within policy window) 3) Calculate prorated amount 4) Submit refund request in billing system 5) Send confirmation email 6) Log in CRM with reason code',
        tags: ['refund', 'process', 'billing'],
        category: 'procedure',
      },
      {
        content: 'Escalation procedure: 1) Attempt resolution at L1 (15 min max) 2) If unresolved, escalate to L2 with full context 3) L2 has 4-hour SLA 4) Critical issues (data loss, security) go directly to L3 engineering 5) Always update customer within 1 hour of escalation',
        tags: ['escalation', 'support', 'sla'],
        category: 'procedure',
      },
    ],
    knowledge: [
      {
        content: 'Pricing tiers: Free ($0, 100 docs), Starter ($29/mo, 1000 docs), Pro ($99/mo, 10000 docs, API access), Enterprise ($499/mo, unlimited, SSO, dedicated support). All plans include email support. Pro+ get priority chat.',
        tags: ['pricing', 'tiers', 'plans'],
        source: 'pricing-page',
      },
      {
        content: 'SLA guarantees: Free — no SLA. Starter — 99.5% uptime. Pro — 99.9% uptime, 8-hour response. Enterprise — 99.99% uptime, 1-hour response, dedicated account manager.',
        tags: ['sla', 'uptime', 'support', 'guarantees'],
        source: 'sla-document',
      },
    ],
  },
  testQueries: [
    {
      query: "What is ACME Corp's subscription and who is their contact?",
      expectedTopics: ['ACME', 'subscription'],
      expectedFacts: ['Enterprise', '$499/month', 'Sarah Chen', 'sarah@acme.com'],
    },
    {
      query: "What is ACME's refund policy?",
      expectedTopics: ['refund', 'policy'],
      expectedFacts: ['30 days', 'correction', 'not 15'],
    },
    {
      query: '¿Cuál es el plan de TechLatam y su contacto?',
      expectedTopics: ['TechLatam', 'plan'],
      expectedFacts: ['Pro', '$99', 'Carlos Ruiz', 'carlos@techlatam.io'],
    },
    {
      query: 'What are the steps to process a refund?',
      expectedTopics: ['refund', 'process'],
      expectedFacts: ['verify identity', 'eligibility', 'prorated', 'billing system', 'confirmation email'],
    },
    {
      query: 'What SLA guarantees do Enterprise customers get?',
      expectedTopics: ['SLA', 'Enterprise'],
      expectedFacts: ['99.99%', '1-hour response', 'dedicated account manager'],
    },
  ],
};
