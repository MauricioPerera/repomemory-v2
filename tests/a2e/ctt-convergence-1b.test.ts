/**
 * CTT Convergence Test: llama-3.2-1b-instruct
 *
 * Measures how many CTT iterations the 1B model needs to pass
 * all validation tests that the 120B model passes on first attempt.
 *
 * For each test case:
 * 1. Attempt to generate workflow
 * 2. If validation fails, save specific correction to RepoMemory
 * 3. Retry with enriched context
 * 4. Repeat until valid or max iterations reached
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
const MODEL_1B = '@cf/meta/llama-3.2-1b-instruct';
const MODEL_3B = '@cf/meta/llama-3.2-3b-instruct';
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
  const dir = mkdtempSync(join(tmpdir(), 'a2e-convergence-'));
  return new RepoMemory({ dir, lockEnabled: false });
}

function cleanup(repo: RepoMemory) {
  repo.dispose();
  rmSync(repo.dir, { recursive: true, force: true });
}

async function callModel(messages: Array<{ role: string; content: string }>, model = MODEL_1B): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, max_tokens: 1500, temperature: 0.1 }),
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
 * Base CTT experience from previous models.
 */
function addBaseCttExperience(repo: RepoMemory, agentId: string) {
  repo.memories.save(agentId, 'user1', {
    content: '[CORRECTION] A2E operation format MUST be nested: {"operation":{"ApiCall":{"method":"GET","url":"...","outputPath":"/workflow/..."}}} — NEVER flat like {"operation":{"type":"ApiCall","method":"GET"}}.',
    category: 'correction',
    tags: ['a2e', 'a2e-error', 'correction', 'structure'],
  });

  repo.memories.save(agentId, 'user1', {
    content: '[CORRECTION] A2E workflow MUST be JSONL format: one JSON object PER LINE. Each line is independent valid JSON. Each line starts with {"type": and is a complete JSON object.',
    category: 'correction',
    tags: ['a2e', 'a2e-error', 'correction', 'jsonl-format'],
  });

  repo.memories.save(agentId, 'user1', {
    content: 'A2E validated pattern: All data paths must start with /workflow/.',
    category: 'fact',
    tags: ['a2e', 'a2e-pattern', 'paths'],
  });
}

/**
 * Generate a specific correction from validation errors.
 */
function generateCorrection(errors: Array<{ line: number; message: string }>, rawResponse: string, attempt: number): string {
  const errorMessages = errors.map(e => e.message);

  if (errorMessages.some(m => m.includes('beginExecution'))) {
    return `[CORRECTION] (iteration ${attempt}) You MUST include a beginExecution line as the LAST line of every workflow. Format: {"type":"beginExecution","executionId":"exec-1","operationOrder":["op1","op2"]}
The operationOrder array must list ALL operationIds defined in the workflow, in execution order.
WITHOUT beginExecution the workflow is INVALID. This is the most common mistake.`;
  }

  if (errorMessages.some(m => m.includes('Invalid JSON'))) {
    // Check if it's a truncation issue (missing closing braces)
    const lastLine = rawResponse.trim().split('\n').pop() || '';
    const openBraces = (lastLine.match(/\{/g) || []).length;
    const closeBraces = (lastLine.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      return `[CORRECTION] (iteration ${attempt}) JSON is truncated — missing closing braces. Each operationUpdate line needs exactly 3 closing braces at the end: }}} (one for primitive config, one for operation, one for the root object). Make sure every line is complete.`;
    }
    return `[CORRECTION] (iteration ${attempt}) Invalid JSON detected. Each line must be valid JSON. Check for: missing quotes, trailing commas, mismatched braces.`;
  }

  if (errorMessages.some(m => m.includes('Unknown primitive'))) {
    return `[CORRECTION] (iteration ${attempt}) Only use valid A2E primitives: ApiCall, FilterData, TransformData, Conditional, Loop, StoreData, Wait, MergeData. The primitive name must be the key inside "operation": {"PrimitiveName": {config}}.`;
  }

  if (errorMessages.some(m => m.includes('operationOrder references undefined'))) {
    return `[CORRECTION] (iteration ${attempt}) All operationIds in operationOrder must match operationIds defined in operationUpdate lines. Check spelling.`;
  }

  return `[CORRECTION] (iteration ${attempt}) Validation errors: ${errorMessages.join('; ')}. Fix these in the next attempt.`;
}

function extractJsonl(response: string): string {
  const codeBlockMatch = response.match(/```(?:jsonl?|a2e)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  const lines = response.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('{'));

  return lines.join('\n');
}

interface ConvergenceResult {
  converged: boolean;
  iterations: number;
  errorsPerIteration: number[];
  finalValid: boolean;
  finalMessages: number;
}

async function runConvergenceLoop(
  repo: RepoMemory,
  userQuery: string,
  label: string,
  model = MODEL_1B,
): Promise<ConvergenceResult> {
  const errorsPerIteration: number[] = [];

  for (let attempt = 1; attempt <= MAX_ITERATIONS; attempt++) {
    const ctx = repo.recall('test-agent', 'user1', userQuery, {
      template: 'a2e',
      maxItems: 25,
      maxChars: 10000,
    });

    const systemPrompt = `You are a workflow generator. Respond ONLY with A2E JSONL lines. No explanations, no markdown, no code blocks.
Each line is a separate valid JSON object.
IMPORTANT: The LAST line MUST be: {"type":"beginExecution","executionId":"exec-1","operationOrder":["id1","id2"]}
Example complete workflow (2 lines + beginExecution):
{"type":"operationUpdate","operationId":"get-data","operation":{"ApiCall":{"method":"GET","url":"https://api.example.com/items","outputPath":"/workflow/items"}}}
{"type":"operationUpdate","operationId":"filter-active","operation":{"FilterData":{"inputPath":"/workflow/items","conditions":[{"field":"active","operator":"==","value":true}],"outputPath":"/workflow/activeItems"}}}
{"type":"beginExecution","executionId":"run-1","operationOrder":["get-data","filter-active"]}

${ctx.formatted}`;

    const response = await callModel([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery },
    ], model);

    const jsonl = extractJsonl(response);
    const fixed = fixJsonl(jsonl);
    const result = validateWorkflow(fixed);

    errorsPerIteration.push(result.errors.length);

    console.log(`  [${label}] Iteration ${attempt}: ${result.valid ? 'VALID' : `${result.errors.length} errors`}`);
    if (!result.valid) {
      console.log(`    Errors: ${result.errors.map(e => e.message).join(' | ')}`);
      console.log(`    Response: ${response.slice(0, 200)}...`);
    } else {
      console.log(`    Messages: ${result.messages.length}`);
      console.log(`    Response: ${response.slice(0, 300)}`);
    }

    if (result.valid) {
      return {
        converged: true,
        iterations: attempt,
        errorsPerIteration,
        finalValid: true,
        finalMessages: result.messages.length,
      };
    }

    // Save specific correction for the next iteration
    const correction = generateCorrection(result.errors, response, attempt);
    repo.memories.save('test-agent', 'user1', {
      content: correction,
      category: 'correction',
      tags: ['a2e', 'a2e-error', 'correction', `iteration-${attempt}`],
    });
  }

  // Final attempt result
  return {
    converged: false,
    iterations: MAX_ITERATIONS,
    errorsPerIteration,
    finalValid: false,
    finalMessages: 0,
  };
}

describe.skipIf(!canRun)('CTT Convergence: llama-3.2-1b iterations to pass all tests', () => {
  let repo: RepoMemory;

  beforeAll(() => {
    repo = makeRepo();
    ingestA2EKnowledge(repo, 'test-agent');
    addBaseCttExperience(repo, 'test-agent');
  });

  afterAll(() => cleanup(repo));

  // Run sequentially so corrections accumulate across tests
  it('Test 1: simple GET + Filter workflow', async () => {
    console.log('\n=== TEST 1: Simple GET + Filter ===');
    const result = await runConvergenceLoop(
      repo,
      'get users from API and filter active ones',
      'simple',
    );

    console.log(`\n  Result: ${result.converged ? 'CONVERGED' : 'DID NOT CONVERGE'} in ${result.iterations} iterations`);
    console.log(`  Error progression: [${result.errorsPerIteration.join(' → ')}]`);

    // Record result for final summary
    (globalThis as Record<string, unknown>).__ctt_simple = result;
  }, 180000);

  it('Test 2: complex multi-step workflow (5 primitives)', async () => {
    console.log('\n=== TEST 2: Complex Multi-Step ===');
    const result = await runConvergenceLoop(
      repo,
      'fetch products from two APIs, merge them, filter by price > 50, sort by name, and save to file',
      'complex',
    );

    console.log(`\n  Result: ${result.converged ? 'CONVERGED' : 'DID NOT CONVERGE'} in ${result.iterations} iterations`);
    console.log(`  Error progression: [${result.errorsPerIteration.join(' → ')}]`);

    (globalThis as Record<string, unknown>).__ctt_complex = result;
  }, 180000);

  it('Test 3: POST with body', async () => {
    console.log('\n=== TEST 3: POST with Body ===');
    const result = await runConvergenceLoop(
      repo,
      'send POST to https://api.example.com/users with name "Luis" and email "luis@test.com"',
      'post',
    );

    console.log(`\n  Result: ${result.converged ? 'CONVERGED' : 'DID NOT CONVERGE'} in ${result.iterations} iterations`);
    console.log(`  Error progression: [${result.errorsPerIteration.join(' → ')}]`);

    (globalThis as Record<string, unknown>).__ctt_post = result;
  }, 180000);

  it('SUMMARY: convergence results', () => {
    const simple = (globalThis as Record<string, unknown>).__ctt_simple as ConvergenceResult | undefined;
    const complex = (globalThis as Record<string, unknown>).__ctt_complex as ConvergenceResult | undefined;
    const post = (globalThis as Record<string, unknown>).__ctt_post as ConvergenceResult | undefined;
    if (!simple || !complex || !post) { console.log('Skipped — previous tests did not run'); return; }

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║       CTT CONVERGENCE RESULTS: llama-3.2-1b (1B model)      ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║ Simple (GET+Filter):  ${simple.converged ? `CONVERGED in ${simple.iterations} iteration(s)` : `NOT CONVERGED (${MAX_ITERATIONS} max)`}`.padEnd(63) + '║');
    console.log(`║   Errors: [${simple.errorsPerIteration.join(' → ')}]`.padEnd(63) + '║');
    console.log(`║ Complex (5 prims):    ${complex.converged ? `CONVERGED in ${complex.iterations} iteration(s)` : `NOT CONVERGED (${MAX_ITERATIONS} max)`}`.padEnd(63) + '║');
    console.log(`║   Errors: [${complex.errorsPerIteration.join(' → ')}]`.padEnd(63) + '║');
    console.log(`║ POST with body:       ${post.converged ? `CONVERGED in ${post.iterations} iteration(s)` : `NOT CONVERGED (${MAX_ITERATIONS} max)`}`.padEnd(63) + '║');
    console.log(`║   Errors: [${post.errorsPerIteration.join(' → ')}]`.padEnd(63) + '║');
    console.log('╠══════════════════════════════════════════════════════════════╣');

    const allConverged = simple.converged && complex.converged && post.converged;
    const totalIterations = simple.iterations + complex.iterations + post.iterations;
    const avgIterations = (totalIterations / 3).toFixed(1);

    console.log(`║ All converged: ${allConverged ? 'YES' : 'NO'}`.padEnd(63) + '║');
    console.log(`║ Total iterations: ${totalIterations} (avg ${avgIterations} per test)`.padEnd(63) + '║');
    console.log(`║ Corrections accumulated: ${repo.memories.find('test-agent', 'user1', 'correction', { limit: 100 }).length}`.padEnd(63) + '║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║ Compare: gpt-oss-120b passes all 3 on iteration 1          ║');
    console.log(`║ CTT overhead for 1B: +${totalIterations - 3} extra iterations`.padEnd(63) + '║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
  });
});

// =========================================================================
// 3B Convergence Test — same structure, should converge faster
// =========================================================================

describe.skipIf(!canRun)('CTT Convergence: llama-3.2-3b iterations to pass all tests', () => {
  let repo: RepoMemory;

  beforeAll(() => {
    repo = makeRepo();
    ingestA2EKnowledge(repo, 'test-agent');
    addBaseCttExperience(repo, 'test-agent');
  });

  afterAll(() => cleanup(repo));

  it('Test 1: simple GET + Filter workflow (3B)', async () => {
    console.log('\n=== 3B TEST 1: Simple GET + Filter ===');
    const result = await runConvergenceLoop(repo, 'get users from API and filter active ones', '3b-simple', MODEL_3B);
    console.log(`\n  Result: ${result.converged ? 'CONVERGED' : 'NOT CONVERGED'} in ${result.iterations} iterations`);
    console.log(`  Error progression: [${result.errorsPerIteration.join(' → ')}]`);
    (globalThis as Record<string, unknown>).__ctt3b_simple = result;
  }, 180000);

  it('Test 2: complex multi-step workflow (3B)', async () => {
    console.log('\n=== 3B TEST 2: Complex Multi-Step ===');
    const result = await runConvergenceLoop(repo, 'fetch products from two APIs, merge them, filter by price > 50, sort by name, and save to file', '3b-complex', MODEL_3B);
    console.log(`\n  Result: ${result.converged ? 'CONVERGED' : 'NOT CONVERGED'} in ${result.iterations} iterations`);
    console.log(`  Error progression: [${result.errorsPerIteration.join(' → ')}]`);
    (globalThis as Record<string, unknown>).__ctt3b_complex = result;
  }, 180000);

  it('Test 3: POST with body (3B)', async () => {
    console.log('\n=== 3B TEST 3: POST with Body ===');
    const result = await runConvergenceLoop(repo, 'send POST to https://api.example.com/users with name "Luis" and email "luis@test.com"', '3b-post', MODEL_3B);
    console.log(`\n  Result: ${result.converged ? 'CONVERGED' : 'NOT CONVERGED'} in ${result.iterations} iterations`);
    console.log(`  Error progression: [${result.errorsPerIteration.join(' → ')}]`);
    (globalThis as Record<string, unknown>).__ctt3b_post = result;
  }, 180000);

  it('SUMMARY: 1B vs 3B convergence', () => {
    const s1 = (globalThis as Record<string, unknown>).__ctt_simple as ConvergenceResult | undefined;
    const c1 = (globalThis as Record<string, unknown>).__ctt_complex as ConvergenceResult | undefined;
    const p1 = (globalThis as Record<string, unknown>).__ctt_post as ConvergenceResult | undefined;
    const s3 = (globalThis as Record<string, unknown>).__ctt3b_simple as ConvergenceResult | undefined;
    const c3 = (globalThis as Record<string, unknown>).__ctt3b_complex as ConvergenceResult | undefined;
    const p3 = (globalThis as Record<string, unknown>).__ctt3b_post as ConvergenceResult | undefined;

    if (!s3 || !c3 || !p3) { console.log('Skipped'); return; }

    const fmt = (r: ConvergenceResult | undefined) => r ? (r.converged ? `OK in ${r.iterations}` : `NO (${MAX_ITERATIONS})`) : 'N/A';

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║          CTT CONVERGENCE: 1B vs 3B vs 120B                  ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║ Test              │ 1B          │ 3B          │ 120B        ║');
    console.log('╠───────────────────┼─────────────┼─────────────┼─────────────╣');
    console.log(`║ Simple GET+Filter │ ${fmt(s1).padEnd(12)}│ ${fmt(s3).padEnd(12)}│ OK in 1     ║`);
    console.log(`║ Complex 5 prims   │ ${fmt(c1).padEnd(12)}│ ${fmt(c3).padEnd(12)}│ OK in 1     ║`);
    console.log(`║ POST with body    │ ${fmt(p1).padEnd(12)}│ ${fmt(p3).padEnd(12)}│ OK in 1     ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    const total3b = s3.iterations + c3.iterations + p3.iterations;
    const all3b = s3.converged && c3.converged && p3.converged;
    console.log(`\n3B all converged: ${all3b ? 'YES' : 'NO'}, total iterations: ${total3b}`);
    console.log(`3B error progressions:`);
    console.log(`  Simple:  [${s3.errorsPerIteration.join(' → ')}]`);
    console.log(`  Complex: [${c3.errorsPerIteration.join(' → ')}]`);
    console.log(`  POST:    [${p3.errorsPerIteration.join(' → ')}]`);
  });
});
