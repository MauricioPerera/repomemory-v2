/**
 * Integration test: A2E knowledge in RepoMemory + Cloudflare Workers AI.
 *
 * Tests the full flow:
 * 1. Ingest A2E knowledge into RepoMemory
 * 2. Recall context for a user query
 * 3. Send context to granite-4.0-h-micro via Cloudflare Workers AI
 * 4. Verify the LLM generates a valid A2E workflow
 *
 * Requires: CLOUDFLARE_API_TOKEN env var.
 */

import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../../src/index.js';
import { ingestA2EKnowledge } from '../../src/a2e/knowledge.js';
import { saveWorkflowError } from '../../src/a2e/workflow-skills.js';
import { checkCircuitBreakerFromTag } from '../../src/a2e/circuit-breaker.js';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '091122c40cc6f8d0d421cbc90e2caca8';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const MODEL = '@cf/ibm-granite/granite-4.0-h-micro';

const canRun = !!API_TOKEN;

interface CloudflareResponse {
  result?: {
    response?: string;
    choices?: Array<{
      message?: { content?: string };
    }>;
  };
  success?: boolean;
}

function makeRepo(): RepoMemory {
  const dir = mkdtempSync(join(tmpdir(), 'a2e-llm-test-'));
  return new RepoMemory({ dir, lockEnabled: false });
}

function cleanup(repo: RepoMemory) {
  repo.dispose();
  rmSync(repo.dir, { recursive: true, force: true });
}

async function callGranite(messages: Array<{ role: string; content: string }>): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, max_tokens: 1024, temperature: 0.2 }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudflare API error ${res.status}: ${text}`);
  }

  const data = await res.json() as CloudflareResponse;

  // Handle both response formats: simple (result.response) and OpenAI-compatible (result.choices)
  const content = data.result?.response
    ?? data.result?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(`No content in response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return content;
}

describe.skipIf(!canRun)('A2E + Cloudflare Workers AI Integration', () => {
  let repo: RepoMemory;

  beforeEach(() => {
    repo = makeRepo();
    ingestA2EKnowledge(repo, 'test-agent');
  });

  afterEach(() => cleanup(repo));

  it('LLM generates a valid A2E workflow from recall context', async () => {
    const userQuery = 'quiero consultar la API de usuarios y filtrar solo los activos';
    const ctx = repo.recall('test-agent', 'user1', userQuery, {
      template: 'a2e',
      maxItems: 30,
      maxChars: 12000,
    });

    expect(ctx.totalItems).toBeGreaterThan(0);

    const systemPrompt = `You are an AI assistant that generates A2E workflows.
You MUST respond ONLY with a valid A2E JSONL workflow — no explanations, no markdown, just the JSONL lines.

${ctx.formatted}`;

    const response = await callGranite([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery },
    ]);

    expect(response).toContain('operationUpdate');
    expect(response).toContain('beginExecution');

    const lines = response.trim().split('\n').filter(l => l.trim().startsWith('{'));
    expect(lines.length).toBeGreaterThanOrEqual(2);

    let hasApiCall = false;
    let hasBeginExecution = false;

    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.type).toBeDefined();

      if (parsed.type === 'operationUpdate') {
        expect(parsed.operationId).toBeDefined();
        expect(parsed.operation).toBeDefined();
        if (parsed.operation.ApiCall) hasApiCall = true;
      }

      if (parsed.type === 'beginExecution') {
        expect(parsed.executionId).toBeDefined();
        expect(parsed.operationOrder).toBeDefined();
        expect(Array.isArray(parsed.operationOrder)).toBe(true);
        hasBeginExecution = true;
      }
    }

    expect(hasApiCall).toBe(true);
    expect(hasBeginExecution).toBe(true);
  }, 30000);

  it('LLM generates workflow with FilterData when asked to filter', async () => {
    const userQuery = 'get all products from the store API and filter the ones with price greater than 100';
    const ctx = repo.recall('test-agent', 'user1', userQuery, {
      template: 'a2e',
      maxItems: 30,
      maxChars: 12000,
    });

    const systemPrompt = `You are an AI assistant that generates A2E workflows.
You MUST respond ONLY with a valid A2E JSONL workflow — no explanations, no markdown, just the JSONL lines.

${ctx.formatted}`;

    const response = await callGranite([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery },
    ]);

    const lines = response.trim().split('\n').filter(l => l.trim().startsWith('{'));

    let hasFilterData = false;
    for (const line of lines) {
      const parsed = JSON.parse(line);
      if (parsed.type === 'operationUpdate' && parsed.operation?.FilterData) {
        hasFilterData = true;
        expect(parsed.operation.FilterData.conditions).toBeDefined();
        expect(Array.isArray(parsed.operation.FilterData.conditions)).toBe(true);
      }
    }

    expect(hasFilterData).toBe(true);
  }, 30000);

  it('LLM generates workflow with POST and body', async () => {
    const userQuery = 'create a new user by sending a POST to https://api.example.com/users with name "John" and email "john@test.com"';
    const ctx = repo.recall('test-agent', 'user1', userQuery, {
      template: 'a2e',
      maxItems: 30,
      maxChars: 12000,
    });

    const systemPrompt = `You are an AI assistant that generates A2E workflows.
You MUST respond ONLY with a valid A2E JSONL workflow — no explanations, no markdown, just the JSONL lines.

${ctx.formatted}`;

    const response = await callGranite([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery },
    ]);

    const lines = response.trim().split('\n').filter(l => l.trim().startsWith('{'));

    let hasPost = false;
    for (const line of lines) {
      const parsed = JSON.parse(line);
      if (parsed.type === 'operationUpdate' && parsed.operation?.ApiCall) {
        if (parsed.operation.ApiCall.method === 'POST') {
          hasPost = true;
          expect(parsed.operation.ApiCall.body).toBeDefined();
        }
      }
    }

    expect(hasPost).toBe(true);
  }, 30000);

  it('recall context includes few-shot examples', () => {
    const ctx = repo.recall('test-agent', 'user1', 'consultar API', {
      template: 'a2e',
      maxItems: 30,
      maxChars: 12000,
    });

    expect(ctx.formatted).toContain('Output ONLY valid A2E JSONL');
    expect(ctx.totalItems).toBeGreaterThan(0);
  });

  it('recall context prioritizes corrections', () => {
    saveWorkflowError(
      repo, 'test-agent', 'user1',
      'ApiCall GET https://api.broken.com/data',
      'Connection timeout after 30s',
      'consultar datos',
    );

    const ctx = repo.recall('test-agent', 'user1', 'consultar datos de api.broken.com', {
      template: 'a2e',
      maxItems: 30,
      maxChars: 12000,
    });

    expect(ctx.formatted).toContain('[CORRECTION]');
    expect(ctx.formatted).toContain('api.broken.com');
  });

  it('circuit breaker blocks after repeated errors', () => {
    // Save 3 error memories directly (like the original a2e.test.ts)
    for (let i = 0; i < 3; i++) {
      repo.memories.save('test-agent', 'user1', {
        content: `Error al ejecutar api.failing.com attempt ${i}`,
        category: 'correction',
        tags: ['a2e', 'a2e-error', 'correction'],
      });
    }

    const result = checkCircuitBreakerFromTag(repo, 'test-agent', 'user1', 'ApiCall GET https://api.failing.com/new');
    expect(result).not.toBeNull();
    expect(result!.open).toBe(true);
    expect(result!.errorCount).toBeGreaterThanOrEqual(3);
  });
});
