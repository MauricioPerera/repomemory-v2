/**
 * CTT (Context-Time Training) Inheritance Test: gpt-oss-120b
 *
 * Same test as gemma-7b-it but with a 120B model.
 * Compares how a large model performs with the same RepoMemory
 * knowledge + accumulated CTT experience.
 *
 * Expected: 120B model should produce valid A2E JSONL on first attempt
 * (without needing the CTT correction cycle that gemma needed).
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
const MODEL = '@cf/openai/gpt-oss-120b';

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
  const dir = mkdtempSync(join(tmpdir(), 'a2e-ctt-120b-'));
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
  const content = data.result?.response
    ?? data.result?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(`No content in response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return content;
}

/**
 * Same CTT experience as gemma test — inherited from granite/gpt-oss-20b runs.
 */
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
    content: 'A2E validated pattern: All data paths must start with /workflow/ — e.g., /workflow/users, /workflow/filtered. This applies to outputPath, inputPath, and condition.path.',
    category: 'fact',
    tags: ['a2e', 'a2e-pattern', 'paths'],
  });

  // Correction learned from gemma's failure (CTT inheritance across models)
  repo.memories.save(agentId, 'user1', {
    content: `[CORRECTION] A2E workflow MUST be JSONL format: one JSON object PER LINE. Each line is independent valid JSON.
WRONG (single JSON object): { "operation": { "fetch": {...}, "filter": {...} } }
CORRECT (one JSON per line):
{"type":"operationUpdate","operationId":"fetch","operation":{"ApiCall":{"method":"GET","url":"https://api.example.com/users","outputPath":"/workflow/users"}}}
{"type":"operationUpdate","operationId":"filter","operation":{"FilterData":{"inputPath":"/workflow/users","conditions":[{"field":"status","operator":"==","value":"active"}],"outputPath":"/workflow/filtered"}}}
{"type":"beginExecution","executionId":"exec-1","operationOrder":["fetch","filter"]}
Each line starts with {"type": and is a complete JSON object.`,
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

describe.skipIf(!canRun)('CTT Inheritance: gpt-oss-120b (120B model)', () => {
  let repo: RepoMemory;

  beforeEach(() => {
    repo = makeRepo();
    ingestA2EKnowledge(repo, 'test-agent');
    addCttExperience(repo, 'test-agent');
  });

  afterEach(() => cleanup(repo));

  it('generates a valid A2E workflow on first attempt (no correction cycle needed)', async () => {
    const userQuery = 'get users from API and filter active ones';

    const ctx = repo.recall('test-agent', 'user1', userQuery, {
      template: 'a2e',
      maxItems: 30,
      maxChars: 12000,
    });

    console.log('Total items recalled:', ctx.totalItems);
    console.log('Context length:', ctx.formatted.length, 'chars');
    console.log('Has corrections:', ctx.formatted.includes('[CORRECTION]'));

    const systemPrompt = `You are a workflow generator. Respond ONLY with A2E JSONL lines. No explanations, no markdown, no code blocks.
Each line is a separate valid JSON object.

${ctx.formatted}`;

    const response = await callModel([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery },
    ]);

    console.log('\n--- gpt-oss-120b response ---');
    console.log(response);
    console.log('--- end response ---\n');

    const jsonl = extractJsonl(response);
    const fixed = fixJsonl(jsonl);
    const result = validateWorkflow(fixed);

    console.log('Valid:', result.valid);
    console.log('Messages:', result.messages.length);
    if (!result.valid) {
      console.log('Errors:', result.errors);
    }

    // 120B model should produce valid JSONL on first attempt
    expect(result.valid).toBe(true);
    expect(result.messages.length).toBeGreaterThanOrEqual(2);

    // Should have ApiCall + FilterData + beginExecution
    let hasApiCall = false;
    let hasFilterData = false;
    let hasBeginExecution = false;

    for (const msg of result.messages) {
      const m = msg as Record<string, unknown>;
      if (m.type === 'operationUpdate') {
        const op = m.operation as Record<string, unknown>;
        if (op?.ApiCall) hasApiCall = true;
        if (op?.FilterData) hasFilterData = true;
      }
      if (m.type === 'beginExecution') hasBeginExecution = true;
    }

    expect(hasApiCall).toBe(true);
    expect(hasFilterData).toBe(true);
    expect(hasBeginExecution).toBe(true);
  }, 60000);

  it('generates complex multi-step workflow', async () => {
    const userQuery = 'fetch products from two APIs, merge results, filter by price > 50, sort by name, and save to file';

    const ctx = repo.recall('test-agent', 'user1', userQuery, {
      template: 'a2e',
      maxItems: 30,
      maxChars: 12000,
    });

    const systemPrompt = `You are a workflow generator. Respond ONLY with A2E JSONL lines. No explanations, no markdown, no code blocks.
Each line is a separate valid JSON object.

${ctx.formatted}`;

    const response = await callModel([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery },
    ]);

    console.log('\n--- gpt-oss-120b complex workflow ---');
    console.log(response);
    console.log('--- end ---\n');

    const jsonl = extractJsonl(response);
    const fixed = fixJsonl(jsonl);
    const result = validateWorkflow(fixed);

    console.log('Valid:', result.valid);
    console.log('Messages:', result.messages.length);
    if (!result.valid) console.log('Errors:', result.errors);

    // Should produce a multi-step workflow
    expect(result.messages.length).toBeGreaterThanOrEqual(4);

    // Count primitive types used
    const primitives = new Set<string>();
    for (const msg of result.messages) {
      const m = msg as Record<string, unknown>;
      if (m.type === 'operationUpdate') {
        const op = m.operation as Record<string, unknown>;
        if (op) primitives.add(Object.keys(op)[0]);
      }
    }

    console.log('Primitives used:', [...primitives]);

    // Should use multiple different primitives for this complex query
    expect(primitives.size).toBeGreaterThanOrEqual(3);
  }, 60000);

  it('generates POST workflow with body', async () => {
    const userQuery = 'create a new user by sending POST to https://api.example.com/users with name "Maria" and email "maria@test.com"';

    const ctx = repo.recall('test-agent', 'user1', userQuery, {
      template: 'a2e',
      maxItems: 30,
      maxChars: 12000,
    });

    const systemPrompt = `You are a workflow generator. Respond ONLY with A2E JSONL lines. No explanations, no markdown, no code blocks.
Each line is a separate valid JSON object.

${ctx.formatted}`;

    const response = await callModel([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery },
    ]);

    console.log('\n--- gpt-oss-120b POST workflow ---');
    console.log(response);
    console.log('--- end ---\n');

    const jsonl = extractJsonl(response);
    const fixed = fixJsonl(jsonl);
    const result = validateWorkflow(fixed);

    console.log('Valid:', result.valid);
    if (!result.valid) console.log('Errors:', result.errors);

    expect(result.valid).toBe(true);

    // Should have POST method
    let hasPost = false;
    for (const msg of result.messages) {
      const m = msg as Record<string, unknown>;
      if (m.type === 'operationUpdate') {
        const op = m.operation as Record<string, unknown>;
        const apiCall = op?.ApiCall as Record<string, unknown> | undefined;
        if (apiCall?.method === 'POST') {
          hasPost = true;
          expect(apiCall.body).toBeDefined();
        }
      }
    }

    expect(hasPost).toBe(true);
  }, 60000);

  it('comparison: 120B vs 7B context usage', () => {
    const query = 'consultar API y filtrar datos activos';

    const ctx120b = repo.recall('test-agent', 'user1', query, {
      template: 'a2e',
      maxItems: 30,
      maxChars: 12000,
    });

    const ctx7b = repo.recall('test-agent', 'user1', query, {
      template: 'a2e',
      maxItems: 15,
      maxChars: 4000,
    });

    // Both get the same corrections (CTT)
    expect(ctx120b.formatted).toContain('[CORRECTION]');
    expect(ctx7b.formatted).toContain('[CORRECTION]');

    // 120B gets more context
    expect(ctx120b.formatted.length).toBeGreaterThan(ctx7b.formatted.length);

    console.log('=== CTT Context Comparison ===');
    console.log(`gpt-oss-120b: ${ctx120b.formatted.length} chars, ${ctx120b.totalItems} items`);
    console.log(`gemma-7b-it:  ${ctx7b.formatted.length} chars, ${ctx7b.totalItems} items`);
    console.log(`Ratio: ${(ctx120b.formatted.length / ctx7b.formatted.length).toFixed(1)}x more context for 120B`);
    console.log('Both share the same CTT corrections and knowledge base.');
  });
});
