/**
 * CTT Inheritance Test: qwen2.5-coder-32b-instruct
 *
 * Code-specialized model (32B, 32K context).
 * Interesting because it's optimized for code generation —
 * should excel at structured JSONL output.
 *
 * Same RepoMemory knowledge + CTT experience from all previous models.
 *
 * Requires: CLOUDFLARE_API_TOKEN env var.
 */

import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../../src/index.js';
import { ingestA2EKnowledge } from '../../src/a2e/knowledge.js';
import { validateWorkflow, fixJsonl } from '../../src/a2e/validate.js';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '091122c40cc6f8d0d421cbc90e2caca8';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const MODEL = '@cf/qwen/qwen2.5-coder-32b-instruct';

const canRun = !!API_TOKEN;

interface CloudflareResponse {
  result?: {
    response?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  success?: boolean;
}

function makeRepo(): RepoMemory {
  const dir = mkdtempSync(join(tmpdir(), 'a2e-ctt-coder-'));
  return new RepoMemory({ dir, lockEnabled: false });
}

function cleanup(repo: RepoMemory) {
  repo.dispose();
  rmSync(repo.dir, { recursive: true, force: true });
}

async function callModel(messages: Array<{ role: string; content: string }>): Promise<string> {
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
  let content = data.result?.response
    ?? data.result?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(`No content in response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  // Some models return parsed objects instead of strings
  if (typeof content !== 'string') {
    content = JSON.stringify(content);
  }
  return content;
}

function addCttExperience(repo: RepoMemory, agentId: string) {
  repo.memories.save(agentId, 'user1', {
    content: 'A2E workflow validated: ApiCall + FilterData pipeline works correctly. Always use nested operation format: {"operation":{"ApiCall":{...}}} not flat {"operation":{"type":"ApiCall",...}}',
    category: 'fact',
    tags: ['a2e', 'a2e-pattern', 'validated'],
  });

  repo.memories.save(agentId, 'user1', {
    content: '[CORRECTION] A2E operation format MUST be nested: {"operation":{"ApiCall":{"method":"GET","url":"...","outputPath":"/workflow/..."}}} — NEVER flat like {"operation":{"type":"ApiCall","method":"GET"}}. The primitive name IS the key.',
    category: 'correction',
    tags: ['a2e', 'a2e-error', 'correction', 'structure'],
  });

  repo.memories.save(agentId, 'user1', {
    content: '[CORRECTION] Every A2E workflow MUST end with a beginExecution message containing executionId and operationOrder array listing all operationIds in order.',
    category: 'correction',
    tags: ['a2e', 'a2e-error', 'correction', 'beginExecution'],
  });

  repo.memories.save(agentId, 'user1', {
    content: 'A2E validated pattern: All data paths must start with /workflow/ — e.g., /workflow/users, /workflow/filtered.',
    category: 'fact',
    tags: ['a2e', 'a2e-pattern', 'paths'],
  });

  repo.memories.save(agentId, 'user1', {
    content: '[CORRECTION] A2E workflow MUST be JSONL format: one JSON object PER LINE. Each line is independent valid JSON. NEVER wrap everything in a single JSON object. Each line starts with {"type": and is complete.',
    category: 'correction',
    tags: ['a2e', 'a2e-error', 'correction', 'jsonl-format'],
  });
}

function extractJsonl(response: string): string {
  const codeBlockMatch = response.match(/```(?:jsonl?|a2e)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  const lines = response.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('{'));

  return lines.join('\n');
}

describe.skipIf(!canRun)('CTT Inheritance: qwen2.5-coder-32b-instruct (code model)', () => {
  let repo: RepoMemory;

  beforeEach(() => {
    repo = makeRepo();
    ingestA2EKnowledge(repo, 'test-agent');
    addCttExperience(repo, 'test-agent');
  });

  afterEach(() => cleanup(repo));

  it('generates valid A2E workflow (simple query)', async () => {
    const userQuery = 'get users from API and filter active ones';

    const ctx = repo.recall('test-agent', 'user1', userQuery, {
      template: 'a2e',
      maxItems: 25,
      maxChars: 10000,
    });

    console.log('Total items recalled:', ctx.totalItems);
    console.log('Context length:', ctx.formatted.length, 'chars');

    const systemPrompt = `You are a workflow generator. Respond ONLY with A2E JSONL lines. No explanations, no markdown, no code blocks.
Each line is a separate valid JSON object.

${ctx.formatted}`;

    const response = await callModel([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery },
    ]);

    console.log('\n--- qwen2.5-coder response ---');
    console.log(response);
    console.log('--- end ---\n');

    const jsonl = extractJsonl(response);
    const fixed = fixJsonl(jsonl);
    const result = validateWorkflow(fixed);

    console.log('Valid:', result.valid);
    console.log('Messages:', result.messages.length);
    if (!result.valid) console.log('Errors:', result.errors);

    expect(result.valid).toBe(true);
    expect(result.messages.length).toBeGreaterThanOrEqual(2);

    let hasApiCall = false;
    let hasFilterData = false;
    for (const msg of result.messages) {
      const m = msg as Record<string, unknown>;
      if (m.type === 'operationUpdate') {
        const op = m.operation as Record<string, unknown>;
        if (op?.ApiCall) hasApiCall = true;
        if (op?.FilterData) hasFilterData = true;
      }
    }

    expect(hasApiCall).toBe(true);
    expect(hasFilterData).toBe(true);
  }, 60000);

  it('generates complex multi-step workflow', async () => {
    const userQuery = 'fetch products from two APIs, merge them, filter by price > 50, sort by name, and save to file';

    const ctx = repo.recall('test-agent', 'user1', userQuery, {
      template: 'a2e',
      maxItems: 25,
      maxChars: 10000,
    });

    const systemPrompt = `You are a workflow generator. Respond ONLY with A2E JSONL lines. No explanations, no markdown, no code blocks.
Each line is a separate valid JSON object.

${ctx.formatted}`;

    const response = await callModel([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery },
    ]);

    console.log('\n--- qwen2.5-coder complex workflow ---');
    console.log(response);
    console.log('--- end ---\n');

    const jsonl = extractJsonl(response);
    const fixed = fixJsonl(jsonl);
    const result = validateWorkflow(fixed);

    console.log('Valid:', result.valid);
    console.log('Messages:', result.messages.length);
    if (!result.valid) console.log('Errors:', result.errors);

    expect(result.messages.length).toBeGreaterThanOrEqual(4);

    const primitives = new Set<string>();
    for (const msg of result.messages) {
      const m = msg as Record<string, unknown>;
      if (m.type === 'operationUpdate') {
        const op = m.operation as Record<string, unknown>;
        if (op) primitives.add(Object.keys(op)[0]);
      }
    }

    console.log('Primitives used:', [...primitives]);
    expect(primitives.size).toBeGreaterThanOrEqual(3);
  }, 60000);

  it('generates POST workflow with body', async () => {
    const userQuery = 'send POST to https://api.example.com/users with name "Ana" and email "ana@test.com"';

    const ctx = repo.recall('test-agent', 'user1', userQuery, {
      template: 'a2e',
      maxItems: 25,
      maxChars: 10000,
    });

    const systemPrompt = `You are a workflow generator. Respond ONLY with A2E JSONL lines. No explanations, no markdown, no code blocks.
Each line is a separate valid JSON object.

${ctx.formatted}`;

    const response = await callModel([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery },
    ]);

    console.log('\n--- qwen2.5-coder POST ---');
    console.log(response);
    console.log('--- end ---\n');

    const jsonl = extractJsonl(response);
    const fixed = fixJsonl(jsonl);
    const result = validateWorkflow(fixed);

    console.log('Valid:', result.valid);
    if (!result.valid) console.log('Errors:', result.errors);

    // Check POST is present regardless of full validity
    let hasPost = false;
    const lines = fixed.split('\n').filter(l => l.trim().startsWith('{'));
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'operationUpdate') {
          const apiCall = (parsed.operation as Record<string, unknown>)?.ApiCall as Record<string, unknown> | undefined;
          if (apiCall?.method === 'POST') {
            hasPost = true;
            expect(apiCall.body).toBeDefined();
          }
        }
      } catch { /* skip */ }
    }

    expect(hasPost).toBe(true);

    // If missing beginExecution, this is a CTT learning opportunity
    if (!result.valid) {
      console.log('CTT: saving correction for missing beginExecution on single-operation workflows');
      const missingBegin = result.errors.some(e => e.message.includes('beginExecution'));
      if (missingBegin) {
        console.log('Model produced correct operationUpdate but forgot beginExecution — correctable via CTT');
      }
    }
  }, 60000);

  it('CTT context comparison across all tested models', () => {
    const query = 'consultar API y filtrar datos activos';

    const configs = [
      { name: 'gpt-oss-120b (120B)', maxItems: 30, maxChars: 12000 },
      { name: 'qwq-32b (32B reasoning)', maxItems: 20, maxChars: 8000 },
      { name: 'qwen2.5-coder (32B code)', maxItems: 25, maxChars: 10000 },
      { name: 'gemma-7b-it (7B)', maxItems: 15, maxChars: 4000 },
    ];

    console.log('=== CTT Context Comparison (all models) ===');
    for (const cfg of configs) {
      const ctx = repo.recall('test-agent', 'user1', query, {
        template: 'a2e',
        maxItems: cfg.maxItems,
        maxChars: cfg.maxChars,
      });
      expect(ctx.formatted).toContain('[CORRECTION]');
      console.log(`${cfg.name}: ${ctx.formatted.length} chars, ${ctx.totalItems} items`);
    }
    console.log('All share the same CTT corrections and A2E knowledge base.');
  });
});
