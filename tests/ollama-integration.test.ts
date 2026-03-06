/**
 * Integration test for Ollama + qwen3.5 reasoning model.
 *
 * Requires:
 * - Ollama running on localhost:11434
 * - qwen3.5:0.8b model pulled
 *
 * Run: npx vitest run tests/ollama-integration.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';
import { OllamaProvider } from '../src/ai/providers/ollama.js';
import { AiService } from '../src/ai/service.js';

const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'qwen3.5:0.8b';

// Check if Ollama is available before running
async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return false;
    const data = (await res.json()) as { models: Array<{ name: string }> };
    return data.models.some(m => m.name === MODEL);
  } catch {
    return false;
  }
}

describe('Ollama + qwen3.5 Integration', async () => {
  const available = await isOllamaAvailable();
  if (!available) {
    it.skip('Ollama not available — skipping integration tests', () => {});
    return;
  }

  let tmpDir: string;
  let provider: OllamaProvider;
  let aiService: AiService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'repomemory-ollama-'));
    provider = new OllamaProvider({
      model: MODEL,
      baseUrl: OLLAMA_URL,
      disableThinking: true,
      numPredict: 1500,
      numCtx: 4096,
    });
    aiService = new AiService(provider);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('mining: extracts memories from a session transcript', async () => {
    const sessionContent = `User: I configured the project with Node.js 20 and TypeScript 5.4.
Assistant: Great. I set up ESLint with strict rules.
User: We decided to deploy on AWS Lambda.
Assistant: Serverless config ready. Using API Gateway for routing.`;

    const result = await aiService.extractFromSession(sessionContent);

    // Validate structure
    expect(result).toBeDefined();
    expect(result.memories).toBeDefined();
    expect(Array.isArray(result.memories)).toBe(true);
    expect(result.skills).toBeDefined();
    expect(Array.isArray(result.skills)).toBe(true);

    // Should extract at least 1 memory
    expect(result.memories.length).toBeGreaterThanOrEqual(1);

    // Each memory should have required fields
    for (const mem of result.memories) {
      expect(typeof mem.content).toBe('string');
      expect(mem.content.length).toBeGreaterThan(0);
      expect(Array.isArray(mem.tags)).toBe(true);
      // Small models may occasionally produce empty tags — that's acceptable
      expect(typeof mem.category).toBe('string');
    }

    console.log('\n[OLLAMA MINING RESULT]');
    console.log(JSON.stringify(result, null, 2));
  }, { timeout: 300_000 });

  it('consolidation: merges duplicate memories', async () => {
    const memoriesJson = [
      '{"id":"mem-001","content":"Project uses Node.js 20","tags":["nodejs"],"category":"fact"}',
      '{"id":"mem-002","content":"The project runs on Node.js version 20","tags":["node","runtime"],"category":"fact"}',
      '{"id":"mem-003","content":"Deploy target is AWS Lambda","tags":["aws","deploy"],"category":"decision"}',
    ].join('\n');

    const result = await aiService.planConsolidation(memoriesJson);

    expect(result).toBeDefined();
    expect(Array.isArray(result.keep)).toBe(true);
    expect(Array.isArray(result.merge)).toBe(true);
    expect(Array.isArray(result.remove)).toBe(true);

    // All IDs should be accounted for
    const allIds = new Set<string>();
    for (const id of result.keep) allIds.add(id);
    for (const m of result.merge) {
      for (const id of m.sourceIds) allIds.add(id);
    }
    for (const id of result.remove) allIds.add(id);

    // Should reference at least some of the input IDs
    expect(allIds.size).toBeGreaterThanOrEqual(2);

    console.log('\n[OLLAMA CONSOLIDATION RESULT]');
    console.log(JSON.stringify(result, null, 2));
  }, { timeout: 300_000 });

  it('full pipeline: save session, mine, and verify memories', async () => {
    const repo = new RepoMemory({ dir: tmpDir, ai: provider });

    // Save a session
    const [session] = repo.sessions.save('test-agent', 'test-user', {
      content: `User: The database is MySQL 8 with InnoDB engine.
Assistant: Connection pool configured to 10 connections.
User: We chose OAuth2 with Google provider for authentication.
Assistant: Auth flow implemented with refresh token support.`,
      tags: ['setup', 'database', 'auth'],
    });

    expect(session).toBeDefined();
    expect(session.id).toBeTruthy();

    // Mine the session
    const mineResult = await repo.mine(session.id);

    expect(mineResult).toBeDefined();
    console.log('\n[OLLAMA FULL PIPELINE RESULT]');
    console.log('Memories mined:', mineResult.memories?.length ?? 0);
    console.log('Skills mined:', mineResult.skills?.length ?? 0);
    console.log(JSON.stringify(mineResult, null, 2));

    // Check that memories were actually saved
    const memories = repo.memories.list('test-agent', 'test-user');
    console.log('Memories in store:', memories.length);
    expect(memories.length).toBeGreaterThanOrEqual(1);
  }, { timeout: 600_000 });
});
