/**
 * CTT Benchmark Runner
 *
 * Measures improvement from Context-Time Training (RepoMemory recall)
 * vs base model responses across multiple domains and AI providers.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../../src/index.js';
import type { AiMessage } from '../../src/types/ai.js';
import type {
  BenchmarkConfig,
  BenchmarkDomain,
  BenchmarkProvider,
  BenchmarkReport,
  DomainResult,
  QueryResult,
} from './types.js';

const DEFAULT_MAX_CONTEXT_CHARS = 4000;

/** Score a response against expected topics and facts (case-insensitive substring match) */
function scoreResponse(
  response: string,
  expectedTopics: string[],
  expectedFacts: string[],
): { topicHits: number; factHits: number } {
  const lower = response.toLowerCase();
  const topicHits = expectedTopics.filter(t => lower.includes(t.toLowerCase())).length;
  const factHits = expectedFacts.filter(f => lower.includes(f.toLowerCase())).length;
  return { topicHits, factHits };
}

/** Seed a RepoMemory instance with domain data */
function seedDomain(repo: RepoMemory, domain: BenchmarkDomain): void {
  const { agentId, userId, seedData } = domain;

  // Seed memories
  for (const mem of seedData.memories) {
    repo.memories.save(agentId, userId, {
      content: mem.content,
      tags: mem.tags,
      category: mem.category,
    });
  }

  // Seed skills
  for (const skill of seedData.skills) {
    repo.skills.save(agentId, {
      content: skill.content,
      tags: skill.tags,
      category: skill.category,
    });
  }

  // Seed knowledge
  for (const k of seedData.knowledge) {
    repo.knowledge.save(agentId, {
      content: k.content,
      tags: k.tags,
      source: k.source,
    });
  }
}

/** Run a single query against a provider */
async function runQuery(
  provider: BenchmarkProvider,
  query: string,
  systemPrompt?: string,
): Promise<{ response: string; latencyMs: number }> {
  const messages: AiMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: query });

  const start = performance.now();
  const response = await provider.provider.chat(messages);
  const latencyMs = performance.now() - start;
  return { response, latencyMs };
}

/** Run benchmark for a single provider + domain */
async function benchmarkDomain(
  provider: BenchmarkProvider,
  domain: BenchmarkDomain,
  repo: RepoMemory,
  maxContextChars: number,
): Promise<DomainResult> {
  const queryResults: QueryResult[] = [];

  for (const tq of domain.testQueries) {
    // 1. Base model (no context)
    const baseResult = await runQuery(provider, tq.query);
    const baseScore = scoreResponse(baseResult.response, tq.expectedTopics, tq.expectedFacts);
    queryResults.push({
      provider: provider.name,
      model: provider.model,
      domain: domain.name,
      mode: 'base',
      query: tq.query,
      response: baseResult.response,
      latencyMs: baseResult.latencyMs,
      topicHits: baseScore.topicHits,
      topicTotal: tq.expectedTopics.length,
      factHits: baseScore.factHits,
      factTotal: tq.expectedFacts.length,
    });

    // 2. CTT mode (with recall context)
    const recall = repo.recall(domain.agentId, domain.userId, tq.query, {
      limit: 10,
      maxChars: maxContextChars,
    });
    const systemPrompt = `You are a helpful assistant. Use the following context to answer the user's question accurately.\n\n${recall.context}`;

    const cttResult = await runQuery(provider, tq.query, systemPrompt);
    const cttScore = scoreResponse(cttResult.response, tq.expectedTopics, tq.expectedFacts);
    queryResults.push({
      provider: provider.name,
      model: provider.model,
      domain: domain.name,
      mode: 'ctt',
      query: tq.query,
      response: cttResult.response,
      latencyMs: cttResult.latencyMs,
      topicHits: cttScore.topicHits,
      topicTotal: tq.expectedTopics.length,
      factHits: cttScore.factHits,
      factTotal: tq.expectedFacts.length,
      contextItems: recall.items.length,
      contextChars: recall.context.length,
    });
  }

  // Aggregate
  const baseResults = queryResults.filter(r => r.mode === 'base');
  const cttResults = queryResults.filter(r => r.mode === 'ctt');

  const totalPossible = domain.testQueries.reduce(
    (sum, q) => sum + q.expectedTopics.length + q.expectedFacts.length,
    0,
  );

  const baseHits = baseResults.reduce((sum, r) => sum + r.topicHits + r.factHits, 0);
  const cttHits = cttResults.reduce((sum, r) => sum + r.topicHits + r.factHits, 0);

  const baseScore = totalPossible > 0 ? baseHits / totalPossible : 0;
  const cttScore = totalPossible > 0 ? cttHits / totalPossible : 0;
  const improvement = baseScore > 0 ? ((cttScore - baseScore) / baseScore) * 100 : cttScore > 0 ? Infinity : 0;

  const avgBaseLatency = baseResults.reduce((s, r) => s + r.latencyMs, 0) / (baseResults.length || 1);
  const avgCttLatency = cttResults.reduce((s, r) => s + r.latencyMs, 0) / (cttResults.length || 1);

  return {
    provider: provider.name,
    model: provider.model,
    domain: domain.name,
    baseScore,
    cttScore,
    improvement,
    avgBaseLatencyMs: avgBaseLatency,
    avgCttLatencyMs: avgCttLatency,
    queryResults,
  };
}

/** Generate markdown report from results */
function generateReport(results: DomainResult[], timestamp: string): string {
  const lines: string[] = [];
  lines.push(`# CTT Benchmark Report — ${timestamp}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Model | Domain | Base Score | CTT Score | Improvement | Base Latency | CTT Latency |');
  lines.push('|-------|--------|-----------|-----------|-------------|-------------|-------------|');

  for (const r of results) {
    const imp = isFinite(r.improvement) ? `+${r.improvement.toFixed(0)}%` : 'N/A→CTT';
    lines.push(
      `| ${r.model} | ${r.domain} | ${(r.baseScore * 100).toFixed(0)}% | ${(r.cttScore * 100).toFixed(0)}% | ${imp} | ${r.avgBaseLatencyMs.toFixed(0)}ms | ${r.avgCttLatencyMs.toFixed(0)}ms |`,
    );
  }

  lines.push('');
  lines.push('## Detail per Query');
  lines.push('');

  for (const r of results) {
    lines.push(`### ${r.model} — ${r.domain}`);
    lines.push('');

    const baseQ = r.queryResults.filter(q => q.mode === 'base');
    const cttQ = r.queryResults.filter(q => q.mode === 'ctt');

    for (let i = 0; i < baseQ.length; i++) {
      const b = baseQ[i];
      const c = cttQ[i];
      lines.push(`**Q:** ${b.query}`);
      lines.push(`- Base: topics ${b.topicHits}/${b.topicTotal}, facts ${b.factHits}/${b.factTotal} (${b.latencyMs.toFixed(0)}ms)`);
      if (c) {
        lines.push(`- CTT:  topics ${c.topicHits}/${c.topicTotal}, facts ${c.factHits}/${c.factTotal} (${c.latencyMs.toFixed(0)}ms, ${c.contextItems} items, ${c.contextChars} chars)`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('*Generated by RepoMemory CTT Benchmark Framework*');
  return lines.join('\n');
}

/** Run the full CTT benchmark */
export async function runBenchmark(config: BenchmarkConfig): Promise<BenchmarkReport> {
  const maxContextChars = config.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
  const results: DomainResult[] = [];
  const timestamp = new Date().toISOString().slice(0, 10);

  for (const domain of config.domains) {
    // Create fresh RepoMemory per domain
    const tmpDir = mkdtempSync(join(tmpdir(), 'ctt-bench-'));
    const repo = new RepoMemory({ dir: tmpDir });
    seedDomain(repo, domain);

    try {
      for (const provider of config.providers) {
        console.log(`[CTT-BENCH] Running: ${provider.name} × ${domain.name}`);
        const result = await benchmarkDomain(provider, domain, repo, maxContextChars);
        results.push(result);
        console.log(
          `[CTT-BENCH]   Base: ${(result.baseScore * 100).toFixed(0)}% → CTT: ${(result.cttScore * 100).toFixed(0)}% (${isFinite(result.improvement) ? `+${result.improvement.toFixed(0)}%` : 'N/A→CTT'})`,
        );
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // Summary
  const avgImprovement =
    results.filter(r => isFinite(r.improvement)).reduce((s, r) => s + r.improvement, 0) /
    (results.filter(r => isFinite(r.improvement)).length || 1);

  const bestResult = results.reduce((best, r) => (r.cttScore > best.cttScore ? r : best), results[0]);

  const markdown = generateReport(results, timestamp);

  return {
    timestamp,
    results,
    summary: {
      avgImprovement,
      bestProvider: bestResult?.provider ?? 'N/A',
      bestDomain: bestResult?.domain ?? 'N/A',
    },
    markdown,
  };
}
