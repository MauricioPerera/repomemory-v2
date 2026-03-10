#!/usr/bin/env node
/**
 * CTT Mass Benchmark — Evaluates CTT effectiveness across many models.
 * Captures: model size, response quality, latency, token efficiency.
 * No-think only (think mode proven harmful for sub-4B models).
 *
 * Usage:
 *   OLLAMA_BASE_URL=http://localhost:11434 node run-mass-benchmark.mjs <model1> [model2] ...
 *   OLLAMA_BASE_URL=http://localhost:11434 node run-mass-benchmark.mjs --all  (runs all pulled models)
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../../dist/index.js';

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

// ─── Domains (same as standard benchmark) ─────────────────────────────────────
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

// ─── Ollama API ──────────────────────────────────────────────────────────────
async function ollamaChat(model, messages, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        think: false,
        options: { num_predict: 512 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      content: data.message?.content ?? '',
      totalDuration: data.total_duration ? data.total_duration / 1e6 : 0,
      evalCount: data.eval_count ?? 0,
      promptEvalCount: data.prompt_eval_count ?? 0,
    };
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Timeout after ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Get model info from Ollama ──────────────────────────────────────────────
async function getModelInfo(model) {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    if (!res.ok) return { sizeBytes: 0, parameterSize: 'unknown', quantization: 'unknown', family: 'unknown' };
    const data = await res.json();
    const details = data.details || {};
    const modelInfo = data.model_info || {};

    // Get parameter count from model_info
    let parameterSize = details.parameter_size || 'unknown';
    let family = details.family || 'unknown';
    let quantization = details.quantization_level || 'unknown';

    // Try to get size from model_info
    let sizeBytes = 0;
    if (data.size) sizeBytes = data.size;

    return { sizeBytes, parameterSize, quantization, family };
  } catch {
    return { sizeBytes: 0, parameterSize: 'unknown', quantization: 'unknown', family: 'unknown' };
  }
}

// Get model file size from ollama list
async function getModelSize(model) {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!res.ok) return 0;
    const data = await res.json();
    const m = data.models?.find(x => x.name === model || x.name === `${model}:latest`);
    return m?.size || 0;
  } catch {
    return 0;
  }
}

// ─── Scoring ─────────────────────────────────────────────────────────────────
function scoreResponse(response, expectedTopics, expectedFacts) {
  const lower = response.toLowerCase();
  const topicHits = expectedTopics.filter(t => lower.includes(t.toLowerCase())).length;
  const factHits = expectedFacts.filter(f => lower.includes(f.toLowerCase())).length;
  return { topicHits, factHits };
}

// Quality assessment: beyond just fact matching
function assessQuality(response, query) {
  const words = response.trim().split(/\s+/).length;
  const queryLang = /[áéíóúñ¿¡]/.test(query) ? 'es' : 'en';
  const respLang = /[áéíóúñ¿¡]/.test(response) ? 'es' : 'en';

  // Coherence: response should be non-empty, reasonable length, not just repeated tokens
  let coherence = 1.0;
  if (words < 5) coherence = 0.2;          // Too short — likely garbage
  else if (words < 10) coherence = 0.5;     // Very brief
  else if (words > 400) coherence = 0.7;    // Rambling

  // Repetition check: if any 5-word phrase repeats 3+ times, deduct
  const phrases = [];
  const tokens = response.toLowerCase().split(/\s+/);
  for (let i = 0; i <= tokens.length - 5; i++) {
    phrases.push(tokens.slice(i, i + 5).join(' '));
  }
  const phraseCounts = {};
  for (const p of phrases) phraseCounts[p] = (phraseCounts[p] || 0) + 1;
  const maxRepeat = Math.max(0, ...Object.values(phraseCounts));
  if (maxRepeat >= 5) coherence *= 0.3;      // Severe repetition
  else if (maxRepeat >= 3) coherence *= 0.6;  // Moderate repetition

  // Language match bonus
  const langMatch = queryLang === respLang ? 1.0 : 0.8;

  return { words, coherence, langMatch, queryLang, respLang };
}

// ─── Seed domain ────────────────────────────────────────────────────────────
function seedDomain(repo, domain) {
  const { agentId, userId, seedData } = domain;
  for (const m of seedData.memories) repo.memories.save(agentId, userId, m);
  for (const s of seedData.skills) repo.skills.save(agentId, undefined, s);
  for (const k of seedData.knowledge) repo.knowledge.save(agentId, undefined, k);
}

// ─── Benchmark one model ────────────────────────────────────────────────────
async function benchmarkModel(model) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Benchmarking: ${model}`);
  console.log(`${'═'.repeat(60)}`);

  // Get model info
  const [info, sizeBytes] = await Promise.all([
    getModelInfo(model),
    getModelSize(model),
  ]);
  const sizeMB = sizeBytes / (1024 * 1024);
  const sizeGB = sizeBytes / (1024 * 1024 * 1024);
  console.log(`  Size: ${sizeMB.toFixed(0)}MB | Params: ${info.parameterSize} | Quant: ${info.quantization} | Family: ${info.family}`);

  const domainResults = [];

  for (const domain of domains) {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ctt-mass-'));
    const repo = new RepoMemory({ dir: tmpDir });
    seedDomain(repo, domain);

    let baseHits = 0, cttHits = 0, totalPossible = 0;
    let baseLatency = 0, cttLatency = 0;
    let baseTokens = 0, cttTokens = 0;
    let basePromptTokens = 0, cttPromptTokens = 0;
    let baseQuality = 0, cttQuality = 0;
    const queryDetails = [];

    try {
      let qi = 0;
      for (const tq of domain.testQueries) {
        qi++;
        const possible = tq.expectedTopics.length + tq.expectedFacts.length;
        totalPossible += possible;

        // Base (no context)
        process.stdout.write(`  [${domain.name} ${qi}/${domain.testQueries.length}] base...`);
        const t0 = performance.now();
        let baseResp;
        try {
          baseResp = await ollamaChat(model, [{ role: 'user', content: tq.query }], 180_000);
        } catch (e) {
          process.stdout.write(` ✗ ${e.message.slice(0, 50)} |`);
          baseResp = { content: '', totalDuration: 0, evalCount: 0, promptEvalCount: 0 };
        }
        const baseMs = performance.now() - t0;
        baseLatency += baseMs;
        baseTokens += baseResp.evalCount;
        basePromptTokens += baseResp.promptEvalCount;
        const bs = scoreResponse(baseResp.content, tq.expectedTopics, tq.expectedFacts);
        const bq = assessQuality(baseResp.content, tq.query);
        baseHits += bs.topicHits + bs.factHits;
        baseQuality += bq.coherence * bq.langMatch;
        process.stdout.write(` ${(baseMs/1000).toFixed(1)}s ${baseResp.evalCount}tok | ctt...`);

        // CTT (with recall context)
        const recall = repo.recall(domain.agentId, domain.userId, tq.query, { limit: 10, maxChars: 4000 });
        const sysPrompt = `You are a helpful assistant. Use the following context to answer the user's question accurately.\n\n${recall.formatted}`;

        const t1 = performance.now();
        let cttResp;
        try {
          cttResp = await ollamaChat(model, [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: tq.query },
          ], 180_000);
        } catch (e) {
          process.stdout.write(` ✗ ${e.message.slice(0, 50)}`);
          cttResp = { content: '', totalDuration: 0, evalCount: 0, promptEvalCount: 0 };
        }
        const cttMs = performance.now() - t1;
        cttLatency += cttMs;
        cttTokens += cttResp.evalCount;
        cttPromptTokens += cttResp.promptEvalCount;
        const cs = scoreResponse(cttResp.content, tq.expectedTopics, tq.expectedFacts);
        const cq = assessQuality(cttResp.content, tq.query);
        cttHits += cs.topicHits + cs.factHits;
        cttQuality += cq.coherence * cq.langMatch;
        console.log(` ${(cttMs/1000).toFixed(1)}s ${cttResp.evalCount}tok ✓`);

        queryDetails.push({
          query: tq.query,
          base: { topicHits: bs.topicHits, factHits: bs.factHits, totalTopics: tq.expectedTopics.length, totalFacts: tq.expectedFacts.length, latencyMs: baseMs, tokens: baseResp.evalCount, words: bq.words, coherence: bq.coherence, langMatch: bq.langMatch, response: baseResp.content.slice(0, 500) },
          ctt: { topicHits: cs.topicHits, factHits: cs.factHits, totalTopics: tq.expectedTopics.length, totalFacts: tq.expectedFacts.length, latencyMs: cttMs, tokens: cttResp.evalCount, words: cq.words, coherence: cq.coherence, langMatch: cq.langMatch, response: cttResp.content.slice(0, 500) },
        });
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }

    const nQ = domain.testQueries.length;
    const baseScore = totalPossible > 0 ? baseHits / totalPossible : 0;
    const cttScore = totalPossible > 0 ? cttHits / totalPossible : 0;
    const improvement = baseScore > 0 ? ((cttScore - baseScore) / baseScore) * 100 : cttScore > 0 ? Infinity : 0;

    console.log(`  ${domain.name}: Base ${(baseScore*100).toFixed(0)}% → CTT ${(cttScore*100).toFixed(0)}% (${isFinite(improvement) ? `+${improvement.toFixed(0)}%` : 'N/A→CTT'}) | ${(baseLatency/nQ/1000).toFixed(1)}s / ${(cttLatency/nQ/1000).toFixed(1)}s`);

    domainResults.push({
      domain: domain.name,
      baseScore, cttScore, improvement,
      avgBaseLatencyMs: baseLatency / nQ,
      avgCttLatencyMs: cttLatency / nQ,
      totalBaseTokens: baseTokens,
      totalCttTokens: cttTokens,
      avgBaseQuality: baseQuality / nQ,
      avgCttQuality: cttQuality / nQ,
      queryDetails,
    });
  }

  // Compute model-level aggregates
  const avgBaseScore = domainResults.reduce((s,r) => s + r.baseScore, 0) / domainResults.length;
  const avgCttScore = domainResults.reduce((s,r) => s + r.cttScore, 0) / domainResults.length;
  const avgBaseLatency = domainResults.reduce((s,r) => s + r.avgBaseLatencyMs, 0) / domainResults.length;
  const avgCttLatency = domainResults.reduce((s,r) => s + r.avgCttLatencyMs, 0) / domainResults.length;
  const avgBaseQuality = domainResults.reduce((s,r) => s + r.avgBaseQuality, 0) / domainResults.length;
  const avgCttQuality = domainResults.reduce((s,r) => s + r.avgCttQuality, 0) / domainResults.length;
  const avgImprovement = avgBaseScore > 0 ? ((avgCttScore - avgBaseScore) / avgBaseScore) * 100 : avgCttScore > 0 ? Infinity : 0;

  // Quality-weighted CTT score: combines fact accuracy with coherence
  const qualityWeightedCtt = avgCttScore * avgCttQuality;
  // Efficiency: quality per GB of model
  const efficiencyPerGB = sizeGB > 0 ? qualityWeightedCtt / sizeGB : 0;

  return {
    model,
    info,
    sizeBytes,
    sizeMB,
    sizeGB,
    avgBaseScore,
    avgCttScore,
    avgImprovement,
    avgBaseLatency,
    avgCttLatency,
    avgBaseQuality,
    avgCttQuality,
    qualityWeightedCtt,
    efficiencyPerGB,
    domainResults,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  let models = process.argv.slice(2);

  if (models.length === 0 || models[0] === '--all') {
    // Get all pulled models
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    const data = await res.json();
    models = data.models.map(m => m.name).sort();
    console.log(`Found ${models.length} models: ${models.join(', ')}`);
  }

  console.log(`\n🔬 CTT Mass Benchmark — ${models.length} models`);
  console.log(`   Ollama: ${OLLAMA_BASE}`);
  console.log(`   Domains: ${domains.length} (${domains.map(d => d.name).join(', ')})`);
  console.log(`   Queries per domain: ${domains[0].testQueries.length}`);
  console.log(`   Total calls per model: ${domains.length * domains[0].testQueries.length * 2} (base + CTT)`);
  console.log(`   Total calls: ${models.length * domains.length * domains[0].testQueries.length * 2}\n`);

  const allResults = [];
  let mi = 0;

  for (const model of models) {
    mi++;
    console.log(`\n[${'#'.repeat(60)}]`);
    console.log(`  MODEL ${mi}/${models.length}: ${model}`);
    console.log(`[${'#'.repeat(60)}]`);

    try {
      const result = await benchmarkModel(model);
      allResults.push(result);
      console.log(`\n  ✅ ${model}: Base ${(result.avgBaseScore*100).toFixed(0)}% → CTT ${(result.avgCttScore*100).toFixed(0)}% | ${result.sizeMB.toFixed(0)}MB | QualityWeighted: ${(result.qualityWeightedCtt*100).toFixed(0)}%`);
    } catch (e) {
      console.error(`  ❌ ${model} FAILED: ${e.message}`);
      allResults.push({
        model, info: { sizeBytes: 0, parameterSize: 'unknown', quantization: 'unknown', family: 'unknown' },
        sizeBytes: 0, sizeMB: 0, sizeGB: 0,
        avgBaseScore: 0, avgCttScore: 0, avgImprovement: 0,
        avgBaseLatency: 0, avgCttLatency: 0,
        avgBaseQuality: 0, avgCttQuality: 0,
        qualityWeightedCtt: 0, efficiencyPerGB: 0,
        domainResults: [], error: e.message,
      });
    }
  }

  // ─── Generate Report ────────────────────────────────────────────────────────
  const timestamp = new Date().toISOString().slice(0, 10);
  const lines = [];
  lines.push(`# CTT Mass Benchmark Report — ${timestamp}`);
  lines.push(`> ${allResults.length} models tested across ${domains.length} domains (${domains.map(d => d.name).join(', ')})`);
  lines.push('');

  // ─── Leaderboard (sorted by CTT score) ──────────────────────────────────────
  lines.push('## Leaderboard (sorted by CTT Quality Score)');
  lines.push('');
  lines.push('| Rank | Model | Params | Size | Family | Base | CTT | Improve | Quality | Eff/GB | Latency |');
  lines.push('|------|-------|--------|------|--------|------|-----|---------|---------|--------|---------|');

  const sorted = [...allResults].sort((a, b) => b.qualityWeightedCtt - a.qualityWeightedCtt);
  sorted.forEach((r, i) => {
    const imp = isFinite(r.avgImprovement) ? `+${r.avgImprovement.toFixed(0)}%` : 'N/A';
    lines.push(`| ${i + 1} | ${r.model} | ${r.info.parameterSize} | ${r.sizeMB.toFixed(0)}MB | ${r.info.family} | ${(r.avgBaseScore*100).toFixed(0)}% | ${(r.avgCttScore*100).toFixed(0)}% | ${imp} | ${(r.qualityWeightedCtt*100).toFixed(0)}% | ${(r.efficiencyPerGB*100).toFixed(0)} | ${(r.avgCttLatency/1000).toFixed(1)}s |`);
  });

  // ─── Size tiers ─────────────────────────────────────────────────────────────
  lines.push('');
  lines.push('## By Size Category');
  lines.push('');

  const tiers = [
    { name: 'Nano (<500MB)', min: 0, max: 500 },
    { name: 'Micro (500MB-1GB)', min: 500, max: 1024 },
    { name: 'Small (1-2GB)', min: 1024, max: 2048 },
    { name: 'Medium (2-4GB)', min: 2048, max: 4096 },
  ];

  for (const tier of tiers) {
    const tierModels = sorted.filter(r => r.sizeMB >= tier.min && r.sizeMB < tier.max);
    if (tierModels.length === 0) continue;
    lines.push(`### ${tier.name} — ${tierModels.length} models`);
    lines.push('');
    lines.push('| Model | Params | Size | Base | CTT | Quality | Eff/GB | Latency |');
    lines.push('|-------|--------|------|------|-----|---------|--------|---------|');
    for (const r of tierModels) {
      lines.push(`| ${r.model} | ${r.info.parameterSize} | ${r.sizeMB.toFixed(0)}MB | ${(r.avgBaseScore*100).toFixed(0)}% | ${(r.avgCttScore*100).toFixed(0)}% | ${(r.qualityWeightedCtt*100).toFixed(0)}% | ${(r.efficiencyPerGB*100).toFixed(0)} | ${(r.avgCttLatency/1000).toFixed(1)}s |`);
    }
    lines.push('');
  }

  // ─── Per-Domain breakdown ───────────────────────────────────────────────────
  lines.push('## Per-Domain Results');
  lines.push('');

  for (const domainName of domains.map(d => d.name)) {
    lines.push(`### ${domainName}`);
    lines.push('');
    lines.push('| Model | Base | CTT | Improve | Base Lat | CTT Lat | Base Tok | CTT Tok |');
    lines.push('|-------|------|-----|---------|----------|---------|---------|---------|');
    for (const r of sorted) {
      const dr = r.domainResults.find(d => d.domain === domainName);
      if (!dr) { lines.push(`| ${r.model} | - | - | - | - | - | - | - |`); continue; }
      const imp = isFinite(dr.improvement) ? `+${dr.improvement.toFixed(0)}%` : 'N/A';
      lines.push(`| ${r.model} | ${(dr.baseScore*100).toFixed(0)}% | ${(dr.cttScore*100).toFixed(0)}% | ${imp} | ${(dr.avgBaseLatencyMs/1000).toFixed(1)}s | ${(dr.avgCttLatencyMs/1000).toFixed(1)}s | ${dr.totalBaseTokens} | ${dr.totalCttTokens} |`);
    }
    lines.push('');
  }

  // ─── Response Quality Details (top 5 and bottom 5) ──────────────────────────
  lines.push('## Response Quality Samples');
  lines.push('');
  lines.push('### Top 5 Models — Sample Responses');
  lines.push('');
  for (const r of sorted.slice(0, 5)) {
    lines.push(`#### ${r.model} (CTT: ${(r.avgCttScore*100).toFixed(0)}%, Quality: ${(r.qualityWeightedCtt*100).toFixed(0)}%)`);
    lines.push('');
    // Show one sample from each domain
    for (const dr of r.domainResults) {
      if (dr.queryDetails.length > 0) {
        const q = dr.queryDetails[0];
        lines.push(`**[${dr.domain}] Q:** ${q.query}`);
        lines.push(`- Base (${q.base.topicHits}t/${q.base.factHits}f): ${q.base.response.slice(0, 200)}${q.base.response.length > 200 ? '...' : ''}`);
        lines.push(`- CTT (${q.ctt.topicHits}t/${q.ctt.factHits}f): ${q.ctt.response.slice(0, 200)}${q.ctt.response.length > 200 ? '...' : ''}`);
        lines.push('');
      }
    }
  }

  if (sorted.length > 5) {
    lines.push('### Bottom 5 Models — Sample Responses');
    lines.push('');
    for (const r of sorted.slice(-5)) {
      lines.push(`#### ${r.model} (CTT: ${(r.avgCttScore*100).toFixed(0)}%, Quality: ${(r.qualityWeightedCtt*100).toFixed(0)}%)`);
      lines.push('');
      for (const dr of r.domainResults) {
        if (dr.queryDetails.length > 0) {
          const q = dr.queryDetails[0];
          lines.push(`**[${dr.domain}] Q:** ${q.query}`);
          lines.push(`- Base (${q.base.topicHits}t/${q.base.factHits}f): ${q.base.response.slice(0, 200)}${q.base.response.length > 200 ? '...' : ''}`);
          lines.push(`- CTT (${q.ctt.topicHits}t/${q.ctt.factHits}f): ${q.ctt.response.slice(0, 200)}${q.ctt.response.length > 200 ? '...' : ''}`);
          lines.push('');
        }
      }
    }
  }

  // ─── Key findings ───────────────────────────────────────────────────────────
  lines.push('## Key Findings');
  lines.push('');

  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const bestEfficiency = [...sorted].sort((a, b) => b.efficiencyPerGB - a.efficiencyPerGB)[0];
  const fastest = [...sorted].sort((a, b) => {
    if (a.avgCttLatency === 0) return 1;
    if (b.avgCttLatency === 0) return -1;
    return a.avgCttLatency - b.avgCttLatency;
  })[0];

  lines.push(`- **Best CTT Quality**: ${best.model} — ${(best.qualityWeightedCtt*100).toFixed(0)}% quality-weighted CTT score`);
  lines.push(`- **Best Efficiency**: ${bestEfficiency.model} — ${(bestEfficiency.efficiencyPerGB*100).toFixed(0)} quality per GB`);
  lines.push(`- **Fastest CTT**: ${fastest.model} — ${(fastest.avgCttLatency/1000).toFixed(1)}s avg latency`);
  lines.push(`- **Worst Performance**: ${worst.model} — ${(worst.qualityWeightedCtt*100).toFixed(0)}% quality-weighted CTT score`);
  lines.push(`- **Average CTT Improvement**: +${(sorted.reduce((s,r) => s + (isFinite(r.avgImprovement) ? r.avgImprovement : 0), 0) / sorted.filter(r => isFinite(r.avgImprovement)).length).toFixed(0)}%`);
  lines.push('');

  // ─── Write report ───────────────────────────────────────────────────────────
  lines.push('---');
  lines.push(`*Generated by RepoMemory CTT Mass Benchmark — ${timestamp} — ${allResults.length} models*`);

  const report = lines.join('\n');
  const reportPath = join(process.cwd(), `ctt-mass-benchmark-${timestamp}.md`);
  writeFileSync(reportPath, report);
  console.log(`\n📄 Report saved: ${reportPath}`);

  // Also save raw JSON for further analysis
  const jsonPath = join(process.cwd(), `ctt-mass-benchmark-${timestamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(allResults, null, 2));
  console.log(`📊 Raw data saved: ${jsonPath}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
