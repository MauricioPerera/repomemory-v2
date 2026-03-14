/**
 * CTT Inheritance Test: llama-3.2-3b-instruct
 *
 * 3B model — one of the smallest tested. 128K context window.
 * Tests the lower bound of model capability with CTT experience.
 *
 * Same RepoMemory knowledge + CTT corrections from all previous models.
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
const MODEL = '@cf/meta/llama-3.2-3b-instruct';

const canRun = !!API_TOKEN;

interface CloudflareResponse {
  result?: {
    response?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  success?: boolean;
}

function makeRepo(): RepoMemory {
  const dir = mkdtempSync(join(tmpdir(), 'a2e-ctt-llama3b-'));
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
    body: JSON.stringify({ messages, max_tokens: 800, temperature: 0.1 }),
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
  if (typeof content !== 'string') {
    content = JSON.stringify(content);
  }
  return content;
}

/**
 * Full CTT experience from all previous model runs.
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
    content: 'A2E validated pattern: All data paths must start with /workflow/ — e.g., /workflow/users, /workflow/filtered.',
    category: 'fact',
    tags: ['a2e', 'a2e-pattern', 'paths'],
  });

  repo.memories.save(agentId, 'user1', {
    content: `[CORRECTION] A2E workflow MUST be JSONL format: one JSON object PER LINE. Each line is independent valid JSON. NEVER wrap everything in a single JSON object. Each line starts with {"type": and is complete.`,
    category: 'correction',
    tags: ['a2e', 'a2e-error', 'correction', 'jsonl-format'],
  });

  // Correction from qwen2.5-coder: don't forget beginExecution even for single-op workflows
  repo.memories.save(agentId, 'user1', {
    content: '[CORRECTION] ALWAYS include a beginExecution line at the end, even for single-operation workflows. Example: {"type":"beginExecution","executionId":"exec-1","operationOrder":["my-op"]}',
    category: 'correction',
    tags: ['a2e', 'a2e-error', 'correction', 'beginExecution-required'],
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

describe.skipIf(!canRun)('CTT Inheritance: llama-3.2-3b-instruct (3B model)', () => {
  let repo: RepoMemory;

  beforeEach(() => {
    repo = makeRepo();
    ingestA2EKnowledge(repo, 'test-agent');
    addCttExperience(repo, 'test-agent');
  });

  afterEach(() => cleanup(repo));

  it('generates A2E workflow with CTT experience (simple query)', async () => {
    const userQuery = 'get users from API and filter active ones';

    const ctx = repo.recall('test-agent', 'user1', userQuery, {
      template: 'a2e',
      maxItems: 25,
      maxChars: 10000,
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

    console.log('\n--- llama-3.2-3b response ---');
    console.log(response.slice(0, 800));
    console.log('--- end ---\n');

    const jsonl = extractJsonl(response);
    const fixed = fixJsonl(jsonl);
    const result = validateWorkflow(fixed);

    console.log('Valid:', result.valid);
    console.log('Messages:', result.messages.length);
    if (!result.valid) console.log('Errors:', result.errors);

    // Check understanding of A2E concepts
    const understandsPrimitives = response.includes('ApiCall') || response.includes('FilterData');
    const understandsPaths = response.includes('/workflow/');
    console.log('Understands primitives:', understandsPrimitives);
    console.log('Understands paths:', understandsPaths);

    expect(understandsPrimitives).toBe(true);
    expect(understandsPaths).toBe(true);

    // Try to find operationUpdate structure
    const lines = fixed.split('\n').filter(l => l.trim().startsWith('{'));
    let hasOperationUpdate = false;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'operationUpdate') hasOperationUpdate = true;
      } catch { /* skip */ }
    }

    if (result.valid) {
      console.log('3B model produced VALID workflow on first attempt!');
    } else if (hasOperationUpdate) {
      console.log('3B model produced correct structure but with validation errors — CTT correctable');
    } else {
      console.log('3B model needs more CTT iterations for correct structure');
    }
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

    console.log('\n--- llama-3.2-3b complex ---');
    console.log(response.slice(0, 1000));
    console.log('--- end ---\n');

    const jsonl = extractJsonl(response);
    const fixed = fixJsonl(jsonl);
    const result = validateWorkflow(fixed);

    console.log('Valid:', result.valid);
    console.log('Messages:', result.messages.length);
    if (!result.valid) console.log('Errors:', result.errors);

    // Count primitives regardless of validation
    const primitives = new Set<string>();
    const lines = fixed.split('\n').filter(l => l.trim().startsWith('{'));
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'operationUpdate' && parsed.operation) {
          const keys = Object.keys(parsed.operation);
          if (keys.length > 0) primitives.add(keys[0]);
        }
      } catch { /* skip */ }
    }

    console.log('Primitives used:', [...primitives]);

    // 3B model should at least attempt multiple primitives for a complex query
    if (primitives.size >= 3) {
      console.log('3B model used 3+ primitives — strong comprehension');
    } else if (primitives.size >= 1) {
      console.log('3B model used some primitives — partial comprehension, CTT can improve');
    }

    // Must at least produce some JSON output
    expect(lines.length).toBeGreaterThanOrEqual(1);
  }, 60000);

  it('POST workflow', async () => {
    const userQuery = 'send POST to https://api.example.com/users with name "Luis" and email "luis@test.com"';

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

    console.log('\n--- llama-3.2-3b POST ---');
    console.log(response);
    console.log('--- end ---\n');

    const jsonl = extractJsonl(response);
    const fixed = fixJsonl(jsonl);
    const result = validateWorkflow(fixed);

    console.log('Valid:', result.valid);
    if (!result.valid) console.log('Errors:', result.errors);

    // Check POST presence
    let hasPost = false;
    const lines = fixed.split('\n').filter(l => l.trim().startsWith('{'));
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const apiCall = parsed?.operation?.ApiCall;
        if (apiCall?.method === 'POST') {
          hasPost = true;
          console.log('POST body:', JSON.stringify(apiCall.body));
        }
      } catch { /* skip */ }
    }

    // At minimum should mention POST somewhere
    const mentionsPost = response.includes('POST') || hasPost;
    expect(mentionsPost).toBe(true);

    if (hasPost) console.log('3B model correctly generated POST ApiCall');
  }, 60000);

  it('CTT context comparison: all 8 models', () => {
    const query = 'consultar API y filtrar datos activos';

    const configs = [
      { name: 'gpt-oss-120b (120B)', maxItems: 30, maxChars: 12000 },
      { name: 'qwq-32b (32B reasoning)', maxItems: 20, maxChars: 8000 },
      { name: 'qwen2.5-coder (32B code)', maxItems: 25, maxChars: 10000 },
      { name: 'gpt-oss-20b (20B)', maxItems: 30, maxChars: 12000 },
      { name: 'gemma-7b-it (7B)', maxItems: 15, maxChars: 4000 },
      { name: 'granite-4.0-h-micro (~3B)', maxItems: 30, maxChars: 12000 },
      { name: 'llama-3.2-3b (3B)', maxItems: 25, maxChars: 10000 },
    ];

    console.log('=== CTT Context Comparison (all models) ===');
    for (const cfg of configs) {
      const ctx = repo.recall('test-agent', 'user1', query, {
        template: 'a2e',
        maxItems: cfg.maxItems,
        maxChars: cfg.maxChars,
      });
      expect(ctx.formatted).toContain('[CORRECTION]');
      console.log(`${cfg.name.padEnd(30)} ${ctx.formatted.length} chars, ${ctx.totalItems} items`);
    }
    console.log('All share the same CTT corrections and A2E knowledge base.');
  });
});
