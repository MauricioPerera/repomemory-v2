/**
 * Comparative benchmark: qwen3:0.6b vs qwen3.5:0.8b
 *
 * Tests both models on the same prompts and measures:
 * - Response time (latency)
 * - JSON schema compliance (first attempt + after retry)
 * - Output quality (extraction completeness, consolidation accuracy)
 * - Token efficiency (response length vs useful content)
 *
 * Requires:
 * - Ollama running on localhost:11434
 * - Both models pulled: qwen3:0.6b and qwen3.5:0.8b
 *
 * Run: npx vitest run tests/ollama-comparison.test.ts
 */
import { describe, it, expect } from 'vitest';
import { OllamaProvider } from '../src/ai/providers/ollama.js';
import { AiService, MiningExtraction, ConsolidationPlan } from '../src/ai/service.js';

const OLLAMA_URL = 'http://localhost:11434';

const MODELS = [
  { name: 'qwen3:0.6b', params: '752M', quant: 'Q4_K_M', sizeMB: 498 },
  { name: 'qwen3.5:0.8b', params: '873M', quant: 'Q8_0', sizeMB: 988 },
] as const;

// ─── Test data ─────────────────────────────────────────────────────
const MINING_SESSION = `User: I configured the project with Node.js 20 and TypeScript 5.4.
Assistant: Great. I set up ESLint with strict rules and Prettier for formatting.
User: We decided to deploy on AWS Lambda with API Gateway.
Assistant: Serverless config ready. Using API Gateway for routing. I also added a CI pipeline with GitHub Actions.
User: The database will be DynamoDB with single-table design.
Assistant: DynamoDB table created with pk/sk pattern. Added a helper function to generate composite keys.`;

const CONSOLIDATION_MEMORIES = `{"id":"mem-001","content":"Project uses Node.js 20","tags":["nodejs"],"category":"fact"}
{"id":"mem-002","content":"The project runs on Node.js version 20","tags":["node","runtime"],"category":"fact"}
{"id":"mem-003","content":"Deploy target is AWS Lambda","tags":["aws","deploy"],"category":"decision"}
{"id":"mem-004","content":"Database is DynamoDB","tags":["dynamodb","database"],"category":"decision"}
{"id":"mem-005","content":"DynamoDB with single-table design pattern","tags":["dynamodb","design"],"category":"decision"}`;

// ─── Helpers ───────────────────────────────────────────────────────

interface ModelResult {
  model: string;
  task: string;
  success: boolean;
  timeMs: number;
  retryNeeded: boolean;
  error?: string;
  // Mining-specific
  memoriesCount?: number;
  skillsCount?: number;
  hasProfile?: boolean;
  // Consolidation-specific
  keepCount?: number;
  mergeCount?: number;
  removeCount?: number;
  allIdsAccountedFor?: boolean;
  // Raw output
  rawResponse?: string;
}

const results: ModelResult[] = [];

async function isModelAvailable(model: string): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return false;
    const data = (await res.json()) as { models: Array<{ name: string }> };
    return data.models.some(m => m.name === model);
  } catch {
    return false;
  }
}

/** Direct call to measure raw response without AiService retry logic */
async function rawOllamaCall(model: string, messages: Array<{ role: string; content: string }>): Promise<{
  content: string;
  timeMs: number;
  totalTokens: number;
  evalTokens: number;
  evalDurationMs: number;
}> {
  const start = Date.now();
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      think: false,
      options: { num_predict: 2048, num_ctx: 4096 },
    }),
  });
  const timeMs = Date.now() - start;
  const data = (await res.json()) as {
    message: { content: string };
    total_duration?: number;
    eval_count?: number;
    eval_duration?: number;
    prompt_eval_count?: number;
  };
  return {
    content: data.message?.content ?? '',
    timeMs,
    totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
    evalTokens: data.eval_count ?? 0,
    evalDurationMs: data.eval_duration ? Math.round(data.eval_duration / 1_000_000) : 0,
  };
}

function printSeparator(title: string) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}`);
}

function printComparisonTable() {
  printSeparator('COMPARISON SUMMARY');

  // Group by task
  const tasks = [...new Set(results.map(r => r.task))];

  for (const task of tasks) {
    console.log(`\n┌─ ${task.toUpperCase()} ${'─'.repeat(60 - task.length)}`);
    const taskResults = results.filter(r => r.task === task);

    const header = '│ Model              │ Time     │ OK  │ Retry │ Details';
    console.log(header);
    console.log('│────────────────────│──────────│─────│───────│─────────────────');

    for (const r of taskResults) {
      const model = r.model.padEnd(18);
      const time = `${(r.timeMs / 1000).toFixed(1)}s`.padEnd(8);
      const ok = (r.success ? '✅' : '❌').padEnd(3);
      const retry = (r.retryNeeded ? '⚠️ yes' : '  no').padEnd(5);

      let details = '';
      if (task === 'mining' && r.success) {
        details = `mem=${r.memoriesCount} skills=${r.skillsCount} profile=${r.hasProfile ? 'yes' : 'no'}`;
      } else if (task === 'consolidation' && r.success) {
        details = `keep=${r.keepCount} merge=${r.mergeCount} remove=${r.removeCount} ids_ok=${r.allIdsAccountedFor}`;
      } else if (!r.success) {
        details = `ERROR: ${r.error?.slice(0, 50)}`;
      }

      console.log(`│ ${model} │ ${time} │ ${ok} │ ${retry} │ ${details}`);
    }
    console.log('└' + '─'.repeat(69));
  }

  // Overall winner calculation
  console.log('\n┌─ VERDICT ─────────────────────────────────────────────────────');
  for (const task of tasks) {
    const taskResults = results.filter(r => r.task === task);
    const successful = taskResults.filter(r => r.success);
    if (successful.length === 2) {
      const faster = successful.reduce((a, b) => a.timeMs < b.timeMs ? a : b);
      const speedup = ((successful.find(r => r.model !== faster.model)!.timeMs / faster.timeMs - 1) * 100).toFixed(0);
      console.log(`│ ${task}: ${faster.model} is ${speedup}% faster`);
    } else if (successful.length === 1) {
      console.log(`│ ${task}: Only ${successful[0].model} succeeded`);
    } else {
      console.log(`│ ${task}: Both models failed`);
    }
  }
  console.log('└' + '─'.repeat(69));
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('Ollama Model Comparison: qwen3:0.6b vs qwen3.5:0.8b', async () => {
  // Check availability
  const availability = await Promise.all(MODELS.map(m => isModelAvailable(m.name)));
  const allAvailable = availability.every(Boolean);

  if (!allAvailable) {
    const missing = MODELS.filter((_, i) => !availability[i]).map(m => m.name);
    it.skip(`Models not available: ${missing.join(', ')} — skipping comparison`, () => {});
    return;
  }

  // ─── 1. RAW RESPONSE QUALITY ──────────────────────────────
  describe('1. Raw response quality (without AiService retry)', () => {
    for (const model of MODELS) {
      it(`${model.name}: raw mining response`, async () => {
        printSeparator(`RAW MINING: ${model.name} (${model.params}, ${model.quant})`);

        const messages = [
          {
            role: 'system',
            content: `JSON extraction tool. Read conversation, output ONLY valid JSON following the exact schema.
Memory categories: fact, decision, issue, task
Skill categories: procedure, configuration, troubleshooting, workflow
Rules: output ONLY JSON. content=one sentence. tags=1-3 lowercase words. profile=null if unclear. Empty array [] if none found.`,
          },
          {
            role: 'user',
            content: `Extract:
User: We use React 18 with TypeScript.
Assistant: Tailwind CSS configured. To deploy run npm build then docker compose up.
User: We decided to use PostgreSQL.
Assistant: Database connection pool set to 20.`,
          },
          {
            role: 'assistant',
            content: `{"memories":[{"content":"The project uses React 18 with TypeScript","tags":["react","typescript"],"category":"fact"},{"content":"Tailwind CSS was configured for styling","tags":["tailwind","css"],"category":"fact"},{"content":"Team decided to use PostgreSQL as database","tags":["postgresql","database"],"category":"decision"},{"content":"Database connection pool configured to 20","tags":["database","pool"],"category":"fact"}],"skills":[{"content":"To deploy: run npm build then docker compose up","tags":["deploy","docker"],"category":"procedure"}],"profile":null}`,
          },
          { role: 'user', content: `Extract:\n${MINING_SESSION}` },
        ];

        const result = await rawOllamaCall(model.name, messages);

        console.log(`  Time: ${(result.timeMs / 1000).toFixed(1)}s`);
        console.log(`  Eval tokens: ${result.evalTokens}`);
        console.log(`  Eval speed: ${result.evalDurationMs > 0 ? (result.evalTokens / (result.evalDurationMs / 1000)).toFixed(1) : '?'} tok/s`);
        console.log(`  Response length: ${result.content.length} chars`);
        console.log(`  Response:\n${result.content.slice(0, 1500)}`);

        // Try to parse
        let parsed = false;
        try {
          const json = JSON.parse(result.content);
          parsed = true;
          console.log(`\n  ✅ Valid JSON on first attempt`);
          console.log(`  Memories: ${json.memories?.length ?? 'N/A'}`);
          console.log(`  Skills: ${json.skills?.length ?? 'N/A'}`);
          console.log(`  Profile: ${JSON.stringify(json.profile)}`);
        } catch {
          // Try extracting JSON from text
          const match = result.content.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              const json = JSON.parse(match[0]);
              parsed = true;
              console.log(`\n  ⚠️ JSON extracted from text`);
              console.log(`  Memories: ${json.memories?.length ?? 'N/A'}`);
              console.log(`  Skills: ${json.skills?.length ?? 'N/A'}`);
            } catch {
              console.log(`\n  ❌ Could not parse JSON even after extraction`);
            }
          } else {
            console.log(`\n  ❌ No JSON found in response`);
          }
        }

        expect(result.content.length).toBeGreaterThan(0);
      }, { timeout: 300_000 });
    }
  });

  // ─── 2. MINING THROUGH AI SERVICE ─────────────────────────
  describe('2. Mining through AiService (with retry + autofix)', () => {
    for (const model of MODELS) {
      it(`${model.name}: mining extraction`, async () => {
        printSeparator(`MINING (AiService): ${model.name}`);

        const provider = new OllamaProvider({
          model: model.name,
          baseUrl: OLLAMA_URL,
          disableThinking: true,
          numPredict: 2048,
          numCtx: 4096,
        });
        const aiService = new AiService(provider);

        const start = Date.now();
        let extraction: MiningExtraction | null = null;
        let error: string | undefined;
        let success = false;

        try {
          extraction = await aiService.extractFromSession(MINING_SESSION);
          success = true;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
        const timeMs = Date.now() - start;

        const result: ModelResult = {
          model: model.name,
          task: 'mining',
          success,
          timeMs,
          retryNeeded: timeMs > 60_000, // rough heuristic: >60s probably means retry happened
          error,
          memoriesCount: extraction?.memories.length,
          skillsCount: extraction?.skills.length,
          hasProfile: extraction?.profile != null,
        };
        results.push(result);

        console.log(`  Success: ${success}`);
        console.log(`  Time: ${(timeMs / 1000).toFixed(1)}s`);
        if (extraction) {
          console.log(`  Memories: ${extraction.memories.length}`);
          for (const m of extraction.memories) {
            console.log(`    - [${m.category}] ${m.content} {${m.tags.join(', ')}}`);
          }
          console.log(`  Skills: ${extraction.skills.length}`);
          for (const s of extraction.skills) {
            console.log(`    - [${s.category}] ${s.content} {${s.tags.join(', ')}}`);
          }
          console.log(`  Profile: ${JSON.stringify(extraction.profile)}`);
        } else {
          console.log(`  Error: ${error}`);
        }

        expect(success).toBe(true);
        if (extraction) {
          expect(extraction.memories.length).toBeGreaterThanOrEqual(1);
        }
      }, { timeout: 300_000 });
    }
  });

  // ─── 3. CONSOLIDATION THROUGH AI SERVICE ──────────────────
  describe('3. Consolidation through AiService (with retry + autofix)', () => {
    for (const model of MODELS) {
      it(`${model.name}: consolidation`, async () => {
        printSeparator(`CONSOLIDATION (AiService): ${model.name}`);

        const provider = new OllamaProvider({
          model: model.name,
          baseUrl: OLLAMA_URL,
          disableThinking: true,
          numPredict: 2048,
          numCtx: 4096,
        });
        const aiService = new AiService(provider);

        const start = Date.now();
        let plan: ConsolidationPlan | null = null;
        let error: string | undefined;
        let success = false;

        try {
          plan = await aiService.planConsolidation(CONSOLIDATION_MEMORIES);
          success = true;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
        const timeMs = Date.now() - start;

        // Check if all IDs are accounted for
        const inputIds = new Set(['mem-001', 'mem-002', 'mem-003', 'mem-004', 'mem-005']);
        let allIdsAccountedFor = false;
        if (plan) {
          const foundIds = new Set<string>();
          for (const id of plan.keep) foundIds.add(id);
          for (const m of plan.merge) {
            for (const id of m.sourceIds) foundIds.add(id);
          }
          for (const id of plan.remove) foundIds.add(id);
          allIdsAccountedFor = [...inputIds].every(id => foundIds.has(id));
        }

        const result: ModelResult = {
          model: model.name,
          task: 'consolidation',
          success,
          timeMs,
          retryNeeded: timeMs > 60_000,
          error,
          keepCount: plan?.keep.length,
          mergeCount: plan?.merge.length,
          removeCount: plan?.remove.length,
          allIdsAccountedFor,
        };
        results.push(result);

        console.log(`  Success: ${success}`);
        console.log(`  Time: ${(timeMs / 1000).toFixed(1)}s`);
        if (plan) {
          console.log(`  Keep: [${plan.keep.join(', ')}]`);
          console.log(`  Merge: ${plan.merge.length} groups`);
          for (const m of plan.merge) {
            console.log(`    - [${m.sourceIds.join(', ')}] → "${m.merged.content}" {${m.merged.tags.join(', ')}}`);
          }
          console.log(`  Remove: [${plan.remove.join(', ')}]`);
          console.log(`  All IDs accounted for: ${allIdsAccountedFor}`);
        } else {
          console.log(`  Error: ${error}`);
        }

        expect(success).toBe(true);
      }, { timeout: 300_000 });
    }
  });

  // ─── 4. SPEED BENCHMARK: 3 consecutive calls ─────────────
  describe('4. Speed benchmark: 3 consecutive mining calls', () => {
    for (const model of MODELS) {
      it(`${model.name}: 3x mining speed`, async () => {
        printSeparator(`SPEED BENCHMARK: ${model.name} (3 consecutive calls)`);

        const provider = new OllamaProvider({
          model: model.name,
          baseUrl: OLLAMA_URL,
          disableThinking: true,
          numPredict: 2048,
          numCtx: 4096,
        });
        const aiService = new AiService(provider);

        const shortSession = `User: We use Python 3.12 with FastAPI.
Assistant: Added SQLAlchemy ORM for database access.
User: Redis for caching.
Assistant: Cache layer configured with 5 min TTL.`;

        const times: number[] = [];
        let failures = 0;

        for (let i = 0; i < 3; i++) {
          const start = Date.now();
          try {
            await aiService.extractFromSession(shortSession);
            times.push(Date.now() - start);
          } catch {
            failures++;
            times.push(Date.now() - start);
          }
          console.log(`  Run ${i + 1}: ${((Date.now() - start) / 1000).toFixed(1)}s ${failures > i ? '(FAIL)' : '(OK)'}`);
        }

        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const min = Math.min(...times);
        const max = Math.max(...times);
        console.log(`\n  Avg: ${(avg / 1000).toFixed(1)}s | Min: ${(min / 1000).toFixed(1)}s | Max: ${(max / 1000).toFixed(1)}s | Failures: ${failures}/3`);

        results.push({
          model: model.name,
          task: 'speed-3x',
          success: failures === 0,
          timeMs: avg,
          retryNeeded: false,
          error: failures > 0 ? `${failures}/3 failed` : undefined,
        });
      }, { timeout: 600_000 });
    }
  });

  // ─── FINAL COMPARISON TABLE ───────────────────────────────
  describe('5. Summary', () => {
    it('prints comparison table', () => {
      printComparisonTable();
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
