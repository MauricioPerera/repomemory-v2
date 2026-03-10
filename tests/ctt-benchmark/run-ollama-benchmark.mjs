#!/usr/bin/env node
/**
 * Standalone CTT Benchmark for Ollama — no vitest/TypeScript needed.
 * Usage: OLLAMA_BASE_URL=http://localhost:11434 node run-ollama-benchmark.mjs [model1] [model2]
 * Defaults: gemma3:270m qwen3:0.6b
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Import RepoMemory from compiled dist
import { RepoMemory } from '../../dist/index.js';

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const models = process.argv.slice(2);
if (models.length === 0) models.push('gemma3:270m', 'qwen3:0.6b');

// ─── Domains ─────────────────────────────────────────────────────────────────
const domains = [
  {
    name: 'TechStartup',
    agentId: 'ctt-bench-agent', userId: 'startup-founder',
    seedData: {
      memories: [
        { content: 'Decidimos usar PostgreSQL como base de datos principal por su soporte de JSONB y extensiones como PostGIS. MySQL fue descartado por limitaciones en tipos de datos complejos.', tags: ['database','postgresql','architecture','decision'], category: 'decision' },
        { content: 'El equipo eligió TypeScript sobre JavaScript puro. Razón: type safety reduce bugs en producción un 40% según nuestras métricas del proyecto anterior.', tags: ['typescript','language','decision'], category: 'decision' },
        { content: 'Deploy strategy: Docker containers on AWS ECS Fargate. No queremos administrar servidores. CI/CD con GitHub Actions → ECR → ECS.', tags: ['deploy','docker','aws','ecs','ci-cd'], category: 'decision' },
        { content: 'Authentication: Auth0 para SSO empresarial, JWT tokens con refresh rotation cada 15 minutos. MFA obligatorio para admin roles.', tags: ['auth','auth0','jwt','security'], category: 'decision' },
        { content: 'Sprint planning meeting — we agreed on 2-week sprints with Thursday demos. Retrospectives every other sprint. Jira for tracking.', tags: ['process','agile','sprint','planning'], category: 'fact' },
        { content: 'Performance requirement: API p99 latency must be under 200ms. Current baseline is 350ms. Need to add Redis caching layer for hot queries.', tags: ['performance','redis','caching','requirements'], category: 'issue' },
        { content: 'El presupuesto mensual de infraestructura es $2,500. AWS costs breakdown: ECS $800, RDS $600, S3+CloudFront $300, misc $800.', tags: ['budget','aws','infrastructure','costs'], category: 'fact' },
      ],
      skills: [
        { content: 'Para crear un nuevo microservicio: 1) Usar template en /templates/service-starter 2) Configurar Dockerfile 3) Agregar al docker-compose.yml 4) Crear pipeline en .github/workflows/ 5) Registrar en API Gateway', tags: ['microservice','template','devops'], category: 'procedure' },
        { content: 'Database migration process: 1) Create migration file with `npm run migrate:create` 2) Write up/down SQL 3) Test locally with `npm run migrate:test` 4) PR review 5) Run in staging 6) Run in production during maintenance window', tags: ['database','migration','process'], category: 'procedure' },
      ],
      knowledge: [
        { content: 'API Design Standard: All endpoints use kebab-case URLs, JSON:API format for responses, include pagination via cursor tokens. Error responses follow RFC 7807 Problem Details.', tags: ['api','standards','rest'], source: 'architecture-docs' },
        { content: 'Naming conventions: database tables are snake_case plural (e.g., user_profiles), TypeScript interfaces are PascalCase (e.g., UserProfile), API fields are camelCase.', tags: ['conventions','naming','standards'], source: 'style-guide' },
      ],
    },
    testQueries: [
      { query: '¿Qué base de datos elegimos y por qué?', expectedTopics: ['PostgreSQL','database'], expectedFacts: ['PostgreSQL','JSONB','MySQL descartado'] },
      { query: '¿Cuál es nuestra estrategia de deploy?', expectedTopics: ['Docker','deploy','AWS'], expectedFacts: ['Docker','ECS Fargate','GitHub Actions'] },
      { query: '¿Cómo manejamos la autenticación?', expectedTopics: ['authentication','JWT'], expectedFacts: ['Auth0','JWT','refresh rotation','MFA'] },
      { query: 'What is the monthly infrastructure budget?', expectedTopics: ['budget','infrastructure'], expectedFacts: ['$2,500','AWS','ECS','RDS'] },
      { query: '¿Cuáles son los estándares para diseñar APIs?', expectedTopics: ['API','standards'], expectedFacts: ['kebab-case','JSON:API','RFC 7807'] },
    ],
  },
  {
    name: 'APIDesign',
    agentId: 'ctt-bench-agent', userId: 'backend-lead',
    seedData: {
      memories: [
        { content: 'We switched from REST to GraphQL for the dashboard API because the frontend needed flexible queries. REST remains for public API and webhooks.', tags: ['graphql','rest','api','architecture'], category: 'decision' },
        { content: 'Rate limiting: 100 requests/minute for free tier, 1000/min for pro, 10000/min for enterprise. Implemented via Redis sliding window counter.', tags: ['rate-limiting','redis','tiers'], category: 'fact' },
        { content: 'Bug: API was returning 200 for not-found resources instead of 404. Fixed by adding strict resource existence check middleware. Deployed 2024-12-15.', tags: ['bug','http-status','404','middleware'], category: 'issue' },
        { content: 'Versioning: We use URL-based versioning (/v1/, /v2/) not header-based. Breaking changes get a new major version. Non-breaking additions are backward compatible.', tags: ['versioning','api','breaking-changes'], category: 'decision' },
      ],
      skills: [
        { content: 'Error handling pattern: 1) Catch at controller level 2) Map to standard error codes (ERR_NOT_FOUND, ERR_VALIDATION, ERR_AUTH, ERR_INTERNAL) 3) Return RFC 7807 Problem Details with type URI, title, status, detail fields 4) Log full stack trace at ERROR level 5) Never expose internal details to client', tags: ['error-handling','api','pattern'], category: 'procedure' },
        { content: 'Authentication flow: 1) Client sends credentials to POST /auth/login 2) Server validates against Auth0 3) Returns access_token (15min) + refresh_token (7d) 4) Client includes Bearer token in Authorization header 5) On 401, client uses refresh_token to get new access_token 6) On refresh failure, redirect to login', tags: ['authentication','flow','jwt','auth0'], category: 'procedure' },
        { content: 'Pagination: Use cursor-based pagination for all list endpoints. Response includes { data: [], meta: { cursor, hasMore, totalCount } }. Cursor is base64-encoded composite key. Never use offset pagination for large datasets.', tags: ['pagination','cursor','api'], category: 'procedure' },
        { content: 'Input validation: Use Zod schemas at the controller layer. Define schemas in /schemas/{resource}.ts files. Validate before business logic. Return 422 with validation errors in RFC 7807 format with "errors" extension array.', tags: ['validation','zod','input'], category: 'procedure' },
      ],
      knowledge: [
        { content: 'Webhook delivery: POST to subscriber URL with JSON payload. Include X-Webhook-Signature header (HMAC-SHA256). Retry 3 times with exponential backoff (1s, 5s, 25s). Log delivery status. Disable after 5 consecutive failures.', tags: ['webhooks','delivery','security'], source: 'webhook-docs' },
        { content: 'Database query optimization guide: 1) Add composite indexes for common WHERE+ORDER BY combinations 2) Use EXPLAIN ANALYZE before and after 3) Avoid SELECT * — specify columns 4) Use connection pooling (pgBouncer, max 20 connections) 5) Slow query threshold: 100ms — alert if exceeded', tags: ['database','performance','optimization'], source: 'perf-guide' },
      ],
    },
    testQueries: [
      { query: 'How should we handle API errors?', expectedTopics: ['error handling','RFC 7807'], expectedFacts: ['RFC 7807','Problem Details','ERR_NOT_FOUND','controller level'] },
      { query: 'What is our auth strategy?', expectedTopics: ['authentication','JWT'], expectedFacts: ['Auth0','access_token','refresh_token','15min','Bearer'] },
      { query: 'How does pagination work in our API?', expectedTopics: ['pagination','cursor'], expectedFacts: ['cursor-based','base64','hasMore','never use offset'] },
      { query: 'What are the rate limits per tier?', expectedTopics: ['rate limiting','tiers'], expectedFacts: ['100 requests/minute','1000/min','10000/min','Redis','sliding window'] },
      { query: 'How do we handle webhook deliveries?', expectedTopics: ['webhooks','delivery'], expectedFacts: ['HMAC-SHA256','X-Webhook-Signature','retry 3 times','exponential backoff'] },
    ],
  },
  {
    name: 'CustomerSupport',
    agentId: 'ctt-bench-agent', userId: 'support-agent',
    seedData: {
      memories: [
        { content: 'Customer ACME Corp is on the Enterprise plan ($499/month). Primary contact: Sarah Chen (sarah@acme.com). Account since January 2024.', tags: ['acme','enterprise','customer','subscription'], category: 'fact' },
        { content: 'ACME Corp reported an issue with PDF export — files over 50MB fail silently. Escalated to engineering team. Ticket #4521.', tags: ['acme','bug','pdf','export'], category: 'issue' },
        { content: 'WRONG: ACME Corp refund policy allows refunds within 15 days.', tags: ['acme','refund','policy'], category: 'fact' },
        { content: 'CORRECTION: ACME Corp refund policy allows refunds within 30 days, not 15. Updated per new agreement signed 2024-11-01.', tags: ['acme','refund','policy','supersedes:mem-wrong-refund'], category: 'correction' },
        { content: 'El cliente TechLatam prefiere comunicación en español. Están en el plan Pro ($99/mes). Contacto: Carlos Ruiz (carlos@techlatam.io).', tags: ['techlatam','pro','spanish','customer'], category: 'fact' },
        { content: 'TechLatam requested API access for their internal dashboard. Approved — API key generated 2024-12-01. Quota: 5000 requests/day.', tags: ['techlatam','api','access'], category: 'fact' },
      ],
      skills: [
        { content: 'Refund process: 1) Verify customer identity 2) Check refund eligibility (within policy window) 3) Calculate prorated amount 4) Submit refund request in billing system 5) Send confirmation email 6) Log in CRM with reason code', tags: ['refund','process','billing'], category: 'procedure' },
        { content: 'Escalation procedure: 1) Attempt resolution at L1 (15 min max) 2) If unresolved, escalate to L2 with full context 3) L2 has 4-hour SLA 4) Critical issues (data loss, security) go directly to L3 engineering 5) Always update customer within 1 hour of escalation', tags: ['escalation','support','sla'], category: 'procedure' },
      ],
      knowledge: [
        { content: 'Pricing tiers: Free ($0, 100 docs), Starter ($29/mo, 1000 docs), Pro ($99/mo, 10000 docs, API access), Enterprise ($499/mo, unlimited, SSO, dedicated support). All plans include email support. Pro+ get priority chat.', tags: ['pricing','tiers','plans'], source: 'pricing-page' },
        { content: 'SLA guarantees: Free — no SLA. Starter — 99.5% uptime. Pro — 99.9% uptime, 8-hour response. Enterprise — 99.99% uptime, 1-hour response, dedicated account manager.', tags: ['sla','uptime','support','guarantees'], source: 'sla-document' },
      ],
    },
    testQueries: [
      { query: "What is ACME Corp's subscription and who is their contact?", expectedTopics: ['ACME','subscription'], expectedFacts: ['Enterprise','$499/month','Sarah Chen','sarah@acme.com'] },
      { query: "What is ACME's refund policy?", expectedTopics: ['refund','policy'], expectedFacts: ['30 days','correction','not 15'] },
      { query: '¿Cuál es el plan de TechLatam y su contacto?', expectedTopics: ['TechLatam','plan'], expectedFacts: ['Pro','$99','Carlos Ruiz','carlos@techlatam.io'] },
      { query: 'What are the steps to process a refund?', expectedTopics: ['refund','process'], expectedFacts: ['verify identity','eligibility','prorated','billing system','confirmation email'] },
      { query: 'What SLA guarantees do Enterprise customers get?', expectedTopics: ['SLA','Enterprise'], expectedFacts: ['99.99%','1-hour response','dedicated account manager'] },
    ],
  },
];

// ─── Ollama Provider ─────────────────────────────────────────────────────────
async function ollamaChat(model, messages, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: 512 }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Timeout after ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Scoring ─────────────────────────────────────────────────────────────────
function scoreResponse(response, expectedTopics, expectedFacts) {
  const lower = response.toLowerCase();
  const topicHits = expectedTopics.filter(t => lower.includes(t.toLowerCase())).length;
  const factHits = expectedFacts.filter(f => lower.includes(f.toLowerCase())).length;
  return { topicHits, factHits };
}

// ─── Seed domain ─────────────────────────────────────────────────────────────
function seedDomain(repo, domain) {
  const { agentId, userId, seedData } = domain;
  for (const m of seedData.memories) repo.memories.save(agentId, userId, m);
  for (const s of seedData.skills) repo.skills.save(agentId, undefined, s);
  for (const k of seedData.knowledge) repo.knowledge.save(agentId, undefined, k);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔬 CTT Benchmark — Ollama @ ${OLLAMA_BASE}`);
  console.log(`   Models: ${models.join(', ')}\n`);

  const allResults = [];

  for (const model of models) {
    console.log(`\n━━━ ${model} ━━━`);

    for (const domain of domains) {
      const tmpDir = mkdtempSync(join(tmpdir(), 'ctt-bench-'));
      const repo = new RepoMemory({ dir: tmpDir });
      seedDomain(repo, domain);

      let baseHits = 0, cttHits = 0, totalPossible = 0;
      let baseLatency = 0, cttLatency = 0;
      const queryDetails = [];

      try {
        for (const tq of domain.testQueries) {
          const possible = tq.expectedTopics.length + tq.expectedFacts.length;
          totalPossible += possible;

          // Base (no context)
          const t0 = performance.now();
          let baseResp;
          try {
            baseResp = await ollamaChat(model, [{ role: 'user', content: tq.query }]);
          } catch (e) {
            console.error(`  ✗ ${domain.name} base failed: ${e.message}`);
            baseResp = '';
          }
          const baseMs = performance.now() - t0;
          baseLatency += baseMs;
          const bs = scoreResponse(baseResp, tq.expectedTopics, tq.expectedFacts);
          baseHits += bs.topicHits + bs.factHits;

          // CTT (with recall context)
          const recall = repo.recall(domain.agentId, domain.userId, tq.query, { limit: 10, maxChars: 4000 });
          const sysPrompt = `You are a helpful assistant. Use the following context to answer the user's question accurately.\n\n${recall.formatted}`;

          const t1 = performance.now();
          let cttResp;
          try {
            cttResp = await ollamaChat(model, [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: tq.query },
            ]);
          } catch (e) {
            console.error(`  ✗ ${domain.name} CTT failed: ${e.message}`);
            cttResp = '';
          }
          const cttMs = performance.now() - t1;
          cttLatency += cttMs;
          const cs = scoreResponse(cttResp, tq.expectedTopics, tq.expectedFacts);
          cttHits += cs.topicHits + cs.factHits;

          queryDetails.push({
            query: tq.query,
            base: `${bs.topicHits}/${tq.expectedTopics.length}t ${bs.factHits}/${tq.expectedFacts.length}f (${(baseMs/1000).toFixed(1)}s)`,
            ctt: `${cs.topicHits}/${tq.expectedTopics.length}t ${cs.factHits}/${tq.expectedFacts.length}f (${(cttMs/1000).toFixed(1)}s)`,
          });
        }
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }

      const baseScore = totalPossible > 0 ? baseHits / totalPossible : 0;
      const cttScore = totalPossible > 0 ? cttHits / totalPossible : 0;
      const improvement = baseScore > 0 ? ((cttScore - baseScore) / baseScore) * 100 : cttScore > 0 ? Infinity : 0;
      const nQ = domain.testQueries.length;

      console.log(`  ${domain.name}: Base ${(baseScore*100).toFixed(0)}% → CTT ${(cttScore*100).toFixed(0)}% (${isFinite(improvement) ? `+${improvement.toFixed(0)}%` : 'N/A→CTT'}) | avg ${(baseLatency/nQ/1000).toFixed(1)}s / ${(cttLatency/nQ/1000).toFixed(1)}s`);

      allResults.push({
        model, domain: domain.name,
        baseScore, cttScore, improvement,
        avgBaseLatencyMs: baseLatency / nQ,
        avgCttLatencyMs: cttLatency / nQ,
        queryDetails,
      });
    }
  }

  // ─── Report ──────────────────────────────────────────────────────────────────
  const timestamp = new Date().toISOString().slice(0, 10);
  const lines = [`# CTT Benchmark Report (Ollama Sub-1B) — ${timestamp}`, ''];
  lines.push('## Summary', '');
  lines.push('| Model | Domain | Base Score | CTT Score | Improvement | Base Latency | CTT Latency |');
  lines.push('|-------|--------|-----------|-----------|-------------|-------------|-------------|');
  for (const r of allResults) {
    const imp = isFinite(r.improvement) ? `+${r.improvement.toFixed(0)}%` : 'N/A→CTT';
    lines.push(`| ${r.model} | ${r.domain} | ${(r.baseScore*100).toFixed(0)}% | ${(r.cttScore*100).toFixed(0)}% | ${imp} | ${(r.avgBaseLatencyMs/1000).toFixed(1)}s | ${(r.avgCttLatencyMs/1000).toFixed(1)}s |`);
  }

  // Per-model averages
  lines.push('', '## Per-Model Average', '');
  lines.push('| Model | Avg Base | Avg CTT | Avg Improvement |');
  lines.push('|-------|----------|---------|-----------------|');
  for (const model of models) {
    const mr = allResults.filter(r => r.model === model);
    const avgBase = mr.reduce((s, r) => s + r.baseScore, 0) / mr.length;
    const avgCtt = mr.reduce((s, r) => s + r.cttScore, 0) / mr.length;
    const avgImp = mr.filter(r => isFinite(r.improvement)).reduce((s, r) => s + r.improvement, 0) / (mr.filter(r => isFinite(r.improvement)).length || 1);
    lines.push(`| ${model} | ${(avgBase*100).toFixed(0)}% | ${(avgCtt*100).toFixed(0)}% | +${avgImp.toFixed(0)}% |`);
  }

  lines.push('', '## Detail per Query', '');
  for (const r of allResults) {
    lines.push(`### ${r.model} — ${r.domain}`, '');
    for (const q of r.queryDetails) {
      lines.push(`**Q:** ${q.query}`);
      lines.push(`- Base: ${q.base}`);
      lines.push(`- CTT:  ${q.ctt}`);
      lines.push('');
    }
  }
  lines.push('---', '*Generated by RepoMemory CTT Benchmark Framework*');

  const report = lines.join('\n');
  const reportPath = join(process.cwd(), `ctt-benchmark-ollama-sub1b-${timestamp}.md`);
  writeFileSync(reportPath, report);
  console.log(`\n📄 Report saved: ${reportPath}\n`);
  console.log(report);
}

main().catch(e => { console.error(e); process.exit(1); });
