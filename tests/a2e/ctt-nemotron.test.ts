/**
 * CTT Test: nemotron-3-120b-a12b (MoE 120B, 12B active, 32K context)
 *
 * NVIDIA's agentic MoE model. 120B total params but only 12B active.
 * Tests whether MoE efficiency affects A2E workflow quality.
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
const MODEL = '@cf/nvidia/nemotron-3-120b-a12b';

const canRun = !!API_TOKEN;

interface CloudflareResponse {
  result?: {
    response?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  success?: boolean;
}

function makeRepo(): RepoMemory {
  const dir = mkdtempSync(join(tmpdir(), 'a2e-ctt-nemo-'));
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
  if (typeof content !== 'string') content = JSON.stringify(content);
  return content;
}

function addCttExperience(repo: RepoMemory, agentId: string) {
  repo.memories.save(agentId, 'user1', {
    content: '[CORRECTION] A2E operation format MUST be nested: {"operation":{"ApiCall":{"method":"GET","url":"...","outputPath":"/workflow/..."}}} — NEVER flat.',
    category: 'correction',
    tags: ['a2e', 'a2e-error', 'correction', 'structure'],
  });
  repo.memories.save(agentId, 'user1', {
    content: '[CORRECTION] A2E = JSONL: one JSON per line. ALWAYS end with beginExecution.',
    category: 'correction',
    tags: ['a2e', 'a2e-error', 'correction', 'jsonl-format'],
  });
  repo.memories.save(agentId, 'user1', {
    content: 'A2E validated pattern: All data paths must start with /workflow/.',
    category: 'fact',
    tags: ['a2e', 'a2e-pattern', 'paths'],
  });
}

function extractJsonl(response: string): string {
  const codeBlockMatch = response.match(/```(?:jsonl?|a2e)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  return response.split('\n').map(l => l.trim()).filter(l => l.startsWith('{')).join('\n');
}

describe.skipIf(!canRun)('CTT: nemotron-3-120b-a12b (MoE 120B/12B active)', () => {
  let repo: RepoMemory;

  beforeEach(() => {
    repo = makeRepo();
    ingestA2EKnowledge(repo, 'test-agent');
    addCttExperience(repo, 'test-agent');
  });

  afterEach(() => cleanup(repo));

  it('simple GET + Filter workflow', async () => {
    const userQuery = 'get users from API and filter active ones';
    const ctx = repo.recall('test-agent', 'user1', userQuery, {
      template: 'a2e', maxItems: 25, maxChars: 10000,
    });

    const response = await callModel([
      { role: 'system', content: `You are a workflow generator. Respond ONLY with A2E JSONL lines. No explanations, no markdown.\n\n${ctx.formatted}` },
      { role: 'user', content: userQuery },
    ]);

    console.log('\n--- nemotron simple ---');
    console.log(response);
    console.log('--- end ---\n');

    const result = validateWorkflow(fixJsonl(extractJsonl(response)));
    console.log('Valid:', result.valid, '| Messages:', result.messages.length);
    if (!result.valid) console.log('Errors:', result.errors);

    expect(result.valid).toBe(true);
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
  }, 60000);

  it('complex multi-step workflow (5 primitives)', async () => {
    const userQuery = 'fetch products from two APIs, merge them, filter by price > 50, sort by name, and save to file';
    const ctx = repo.recall('test-agent', 'user1', userQuery, {
      template: 'a2e', maxItems: 25, maxChars: 10000,
    });

    const response = await callModel([
      { role: 'system', content: `You are a workflow generator. Respond ONLY with A2E JSONL lines. No explanations, no markdown.\n\n${ctx.formatted}` },
      { role: 'user', content: userQuery },
    ]);

    console.log('\n--- nemotron complex ---');
    console.log(response);
    console.log('--- end ---\n');

    const result = validateWorkflow(fixJsonl(extractJsonl(response)));
    console.log('Valid:', result.valid, '| Messages:', result.messages.length);
    if (!result.valid) console.log('Errors:', result.errors);

    const primitives = new Set<string>();
    for (const msg of result.messages) {
      const m = msg as Record<string, unknown>;
      if (m.type === 'operationUpdate') {
        const op = m.operation as Record<string, unknown>;
        if (op) primitives.add(Object.keys(op)[0]);
      }
    }
    console.log('Primitives:', [...primitives]);

    expect(result.messages.length).toBeGreaterThanOrEqual(4);
    expect(primitives.size).toBeGreaterThanOrEqual(3);
  }, 60000);

  it('POST with body', async () => {
    const userQuery = 'send POST to https://api.example.com/users with name "Pedro" and email "pedro@test.com"';
    const ctx = repo.recall('test-agent', 'user1', userQuery, {
      template: 'a2e', maxItems: 25, maxChars: 10000,
    });

    const response = await callModel([
      { role: 'system', content: `You are a workflow generator. Respond ONLY with A2E JSONL lines. No explanations, no markdown.\n\n${ctx.formatted}` },
      { role: 'user', content: userQuery },
    ]);

    console.log('\n--- nemotron POST ---');
    console.log(response);
    console.log('--- end ---\n');

    const result = validateWorkflow(fixJsonl(extractJsonl(response)));
    console.log('Valid:', result.valid);
    if (!result.valid) console.log('Errors:', result.errors);

    expect(result.valid).toBe(true);

    let hasPost = false;
    for (const msg of result.messages) {
      const m = msg as Record<string, unknown>;
      const apiCall = (m.operation as Record<string, unknown>)?.ApiCall as Record<string, unknown> | undefined;
      if (apiCall?.method === 'POST') {
        hasPost = true;
        expect(apiCall.body).toBeDefined();
      }
    }
    expect(hasPost).toBe(true);
  }, 60000);

  it('FINAL TABLE: all 11 models', () => {
    console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
    console.log('║           CTT + A2E: COMPLETE MODEL COMPARISON (11 models)               ║');
    console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
    console.log('║ Model                │ Params  │ Active │ Ctx   │ Simple │ Complex │ POST ║');
    console.log('╠──────────────────────┼─────────┼────────┼───────┼────────┼─────────┼──────╣');
    console.log('║ gpt-oss-120b         │ 120B    │ 120B   │ 128K  │ OK 1   │ OK 1    │ OK 1 ║');
    console.log('║ nemotron-3-120b      │ 120B    │ 12B    │ 32K   │ ?      │ ?       │ ?    ║');
    console.log('║ qwq-32b             │ 32B     │ 32B    │ 24K   │ OK 1   │ OK 1    │ OK 1 ║');
    console.log('║ qwen2.5-coder       │ 32B     │ 32B    │ 32K   │ OK 1   │ OK 1    │ ~1   ║');
    console.log('║ gpt-oss-20b         │ 20B     │ 20B    │ 128K  │ OK 1   │ OK 1    │ OK 1 ║');
    console.log('║ gemma-7b-it         │ 7B      │ 7B     │ 8K    │ OK 2   │ -       │ -    ║');
    console.log('║ granite-h-micro     │ ~3B     │ ~3B    │ 131K  │ OK 1   │ -       │ -    ║');
    console.log('║ llama-3.2-3b        │ 3B      │ 3B     │ 128K  │ OK 5   │ OK 1    │ NO   ║');
    console.log('║ gemma-2b-it-lora    │ 2B      │ 2B     │ 8K    │ NO     │ NO      │ NO   ║');
    console.log('║ llama-3.2-1b        │ 1B      │ 1B     │ 60K   │ NO     │ OK 4    │ NO   ║');
    console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
    console.log('║ CTT threshold: >= 3B active params + >= 24K context = zone green          ║');
    console.log('║ MoE question: does 12B active match 120B dense or 20B dense?              ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  });
});
