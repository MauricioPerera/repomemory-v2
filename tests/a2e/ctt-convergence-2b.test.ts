/**
 * CTT Convergence Test: gemma-2b-it-lora (2B, 8K context)
 *
 * The smallest model AND smallest context window tested.
 * Double constraint: limited parameters + limited context.
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
const MODEL = '@cf/google/gemma-2b-it-lora';
const MAX_ITERATIONS = 5;

const canRun = !!API_TOKEN;

interface CloudflareResponse {
  result?: {
    response?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  success?: boolean;
}

function makeRepo(): RepoMemory {
  const dir = mkdtempSync(join(tmpdir(), 'a2e-conv-2b-'));
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
  if (typeof content !== 'string') content = JSON.stringify(content);
  return content;
}

function addCttExperience(repo: RepoMemory, agentId: string) {
  repo.memories.save(agentId, 'user1', {
    content: '[CORRECTION] A2E operation format MUST be nested: {"operation":{"ApiCall":{"method":"GET","url":"...","outputPath":"/workflow/..."}}}.',
    category: 'correction',
    tags: ['a2e', 'a2e-error', 'correction', 'structure'],
  });

  repo.memories.save(agentId, 'user1', {
    content: '[CORRECTION] A2E workflow = JSONL: one JSON per line. Each line starts with {"type": and is complete.',
    category: 'correction',
    tags: ['a2e', 'a2e-error', 'correction', 'jsonl-format'],
  });

  repo.memories.save(agentId, 'user1', {
    content: '[CORRECTION] ALWAYS end with beginExecution: {"type":"beginExecution","executionId":"exec-1","operationOrder":["op1","op2"]}',
    category: 'correction',
    tags: ['a2e', 'a2e-error', 'correction', 'beginExecution'],
  });

  repo.memories.save(agentId, 'user1', {
    content: '[CORRECTION] Each JSON line must have matching braces. operationUpdate ends with }}}.',
    category: 'correction',
    tags: ['a2e', 'a2e-error', 'correction', 'json-braces'],
  });
}

function extractJsonl(response: string): string {
  const codeBlockMatch = response.match(/```(?:jsonl?|a2e)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  return response.split('\n').map(l => l.trim()).filter(l => l.startsWith('{')).join('\n');
}

function generateCorrection(errors: Array<{ line: number; message: string }>, attempt: number): string {
  const msgs = errors.map(e => e.message);
  if (msgs.some(m => m.includes('beginExecution')))
    return `[CORRECTION] (iter ${attempt}) MUST include last line: {"type":"beginExecution","executionId":"exec-1","operationOrder":["id1","id2"]}`;
  if (msgs.some(m => m.includes('Invalid JSON')))
    return `[CORRECTION] (iter ${attempt}) JSON truncated or malformed. Each line must be complete valid JSON ending with }}}`;
  return `[CORRECTION] (iter ${attempt}) Errors: ${msgs.join('; ')}`;
}

interface ConvergenceResult {
  converged: boolean;
  iterations: number;
  errorsPerIteration: number[];
}

async function runLoop(repo: RepoMemory, query: string, label: string): Promise<ConvergenceResult> {
  const errs: number[] = [];

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    // 8K context — use reduced maxChars
    const ctx = repo.recall('test-agent', 'user1', query, {
      template: 'a2e', maxItems: 10, maxChars: 3000,
    });

    const systemPrompt = `You are a workflow generator. Output ONLY A2E JSONL. No text. No markdown.
Each line = one JSON object. LAST line MUST be beginExecution.
Example:
{"type":"operationUpdate","operationId":"get","operation":{"ApiCall":{"method":"GET","url":"https://api.example.com/data","outputPath":"/workflow/data"}}}
{"type":"beginExecution","executionId":"e1","operationOrder":["get"]}

${ctx.formatted}`;

    const response = await callModel([
      { role: 'user', content: systemPrompt + '\n\nGenerate workflow: ' + query },
    ]);

    const jsonl = extractJsonl(response);
    const result = validateWorkflow(fixJsonl(jsonl));
    errs.push(result.errors.length);

    console.log(`  [${label}] Iter ${i}: ${result.valid ? 'VALID' : `${result.errors.length} errors`}`);
    if (!result.valid) {
      console.log(`    Errors: ${result.errors.map(e => e.message).join(' | ')}`);
      console.log(`    Response: ${response.slice(0, 200)}`);
      repo.memories.save('test-agent', 'user1', {
        content: generateCorrection(result.errors, i),
        category: 'correction',
        tags: ['a2e', 'a2e-error', 'correction', `iter-${i}`],
      });
    } else {
      console.log(`    Messages: ${result.messages.length}, Response: ${response.slice(0, 200)}`);
      return { converged: true, iterations: i, errorsPerIteration: errs };
    }
  }

  return { converged: false, iterations: MAX_ITERATIONS, errorsPerIteration: errs };
}

describe.skipIf(!canRun)('CTT Convergence: gemma-2b-it-lora (2B, 8K context)', () => {
  let repo: RepoMemory;

  beforeAll(() => {
    repo = makeRepo();
    ingestA2EKnowledge(repo, 'test-agent');
    addCttExperience(repo, 'test-agent');
  });

  afterAll(() => cleanup(repo));

  it('Test 1: simple GET + Filter', async () => {
    console.log('\n=== GEMMA 2B: Simple GET + Filter ===');
    const r = await runLoop(repo, 'get users from API and filter active ones', '2b-simple');
    console.log(`  Result: ${r.converged ? `CONVERGED in ${r.iterations}` : 'NOT CONVERGED'} [${r.errorsPerIteration.join('→')}]`);
    (globalThis as Record<string, unknown>).__g2b_simple = r;
  }, 180000);

  it('Test 2: complex multi-step', async () => {
    console.log('\n=== GEMMA 2B: Complex Multi-Step ===');
    const r = await runLoop(repo, 'fetch products from two APIs, merge them, filter by price > 50, sort by name, and save to file', '2b-complex');
    console.log(`  Result: ${r.converged ? `CONVERGED in ${r.iterations}` : 'NOT CONVERGED'} [${r.errorsPerIteration.join('→')}]`);
    (globalThis as Record<string, unknown>).__g2b_complex = r;
  }, 180000);

  it('Test 3: POST with body', async () => {
    console.log('\n=== GEMMA 2B: POST with Body ===');
    const r = await runLoop(repo, 'send POST to https://api.example.com/users with name "Luis" and email "luis@test.com"', '2b-post');
    console.log(`  Result: ${r.converged ? `CONVERGED in ${r.iterations}` : 'NOT CONVERGED'} [${r.errorsPerIteration.join('→')}]`);
    (globalThis as Record<string, unknown>).__g2b_post = r;
  }, 180000);

  it('SUMMARY: gemma-2b convergence + full comparison', () => {
    const s = (globalThis as Record<string, unknown>).__g2b_simple as ConvergenceResult;
    const c = (globalThis as Record<string, unknown>).__g2b_complex as ConvergenceResult;
    const p = (globalThis as Record<string, unknown>).__g2b_post as ConvergenceResult;
    if (!s || !c || !p) return;

    const fmt = (r: ConvergenceResult) => r.converged ? `OK in ${r.iterations}` : `NO (${MAX_ITERATIONS})`;

    console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║              FULL CTT CONVERGENCE: ALL MODELS COMPARED                ║');
    console.log('╠════════════════════════════════════════════════════════════════════════╣');
    console.log('║ Model                │ Params │ Ctx   │ Simple   │ Complex  │ POST     ║');
    console.log('╠──────────────────────┼────────┼───────┼──────────┼──────────┼──────────╣');
    console.log('║ gpt-oss-120b         │ 120B   │ 128K  │ OK in 1  │ OK in 1  │ OK in 1  ║');
    console.log('║ qwq-32b             │ 32B    │ 24K   │ OK in 1  │ OK in 1  │ OK in 1  ║');
    console.log('║ qwen2.5-coder       │ 32B    │ 32K   │ OK in 1  │ OK in 1  │ ~1*      ║');
    console.log('║ gpt-oss-20b         │ 20B    │ 128K  │ OK in 1  │ OK in 1  │ OK in 1  ║');
    console.log('║ gemma-7b-it         │ 7B     │ 8K    │ OK in 2  │ -        │ -        ║');
    console.log('║ granite-h-micro     │ ~3B    │ 131K  │ OK in 1  │ -        │ -        ║');
    console.log('║ llama-3.2-3b        │ 3B     │ 128K  │ OK in 5  │ OK in 1  │ NO (5)   ║');
    console.log('║ llama-3.2-1b        │ 1B     │ 60K   │ NO (5)   │ OK in 4  │ NO (5)   ║');
    console.log(`║ gemma-2b-it-lora    │ 2B     │ 8K    │ ${fmt(s).padEnd(9)}│ ${fmt(c).padEnd(9)}│ ${fmt(p).padEnd(9)}║`);
    console.log('╠════════════════════════════════════════════════════════════════════════╣');
    console.log('║ * qwen2.5-coder POST: correct ApiCall but omitted beginExecution      ║');
    console.log('╚════════════════════════════════════════════════════════════════════════╝');

    console.log(`\ngemma-2b error progressions:`);
    console.log(`  Simple:  [${s.errorsPerIteration.join(' → ')}]`);
    console.log(`  Complex: [${c.errorsPerIteration.join(' → ')}]`);
    console.log(`  POST:    [${p.errorsPerIteration.join(' → ')}]`);
  });
});
