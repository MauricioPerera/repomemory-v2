/**
 * CTT Benchmark Framework — Types & Interfaces
 *
 * Measures the effectiveness of Context-Time Training (RepoMemory recall)
 * compared to base model responses across different domains and models.
 */

import type { AiProvider } from '../../src/types/ai.js';

/** Seed data to inject into RepoMemory for a domain */
export interface DomainSeedData {
  memories: Array<{
    content: string;
    tags: string[];
    category: 'fact' | 'decision' | 'issue' | 'task' | 'correction';
  }>;
  skills: Array<{
    content: string;
    tags: string[];
    category: string;
  }>;
  knowledge: Array<{
    content: string;
    tags: string[];
    source?: string;
  }>;
}

/** A test query with expected answers */
export interface TestQuery {
  query: string;
  /** Topics that should appear in the response */
  expectedTopics: string[];
  /** Specific facts that should be correctly stated */
  expectedFacts: string[];
}

/** A domain is a coherent set of seed data + queries */
export interface BenchmarkDomain {
  name: string;
  description: string;
  agentId: string;
  userId: string;
  seedData: DomainSeedData;
  testQueries: TestQuery[];
}

/** A provider entry for the benchmark */
export interface BenchmarkProvider {
  name: string;
  model: string;
  provider: AiProvider;
}

/** Full benchmark configuration */
export interface BenchmarkConfig {
  providers: BenchmarkProvider[];
  domains: BenchmarkDomain[];
  /** Max tokens for context injection. Default: 4000 */
  maxContextChars?: number;
}

/** Result of a single query run */
export interface QueryResult {
  provider: string;
  model: string;
  domain: string;
  mode: 'base' | 'ctt';
  query: string;
  response: string;
  latencyMs: number;
  topicHits: number;
  topicTotal: number;
  factHits: number;
  factTotal: number;
  contextItems?: number;
  contextChars?: number;
}

/** Aggregated results for a provider+domain combination */
export interface DomainResult {
  provider: string;
  model: string;
  domain: string;
  baseScore: number;
  cttScore: number;
  improvement: number;
  avgBaseLatencyMs: number;
  avgCttLatencyMs: number;
  queryResults: QueryResult[];
}

/** Full benchmark report */
export interface BenchmarkReport {
  timestamp: string;
  results: DomainResult[];
  summary: {
    avgImprovement: number;
    bestProvider: string;
    bestDomain: string;
  };
  markdown: string;
}
