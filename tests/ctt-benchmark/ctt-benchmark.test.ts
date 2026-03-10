/**
 * CTT Benchmark Test
 *
 * Skipped by default — requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars.
 * Run manually:
 *   CLOUDFLARE_ACCOUNT_ID=xxx CLOUDFLARE_API_TOKEN=yyy npx vitest run tests/ctt-benchmark
 *
 * For Ollama (local/VPS):
 *   OLLAMA_BASE_URL=http://localhost:8080 npx vitest run tests/ctt-benchmark
 *
 * For Gemma.cpp local (Google API format):
 *   GEMMA_BASE_URL=http://localhost:8080 npx vitest run tests/ctt-benchmark
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runBenchmark } from './runner.js';
import { techStartupDomain } from './domains/techstartup.js';
import { apiDesignDomain } from './domains/api-design.js';
import { customerSupportDomain } from './domains/customer-support.js';
import type { BenchmarkConfig, BenchmarkProvider } from './types.js';
import type { AiProvider, AiMessage } from '../../src/types/ai.js';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL; // e.g., http://localhost:8080
const GEMMA_BASE_URL = process.env.GEMMA_BASE_URL; // e.g., http://localhost:8080

const hasCF = Boolean(CF_ACCOUNT_ID && CF_API_TOKEN);
const hasOllama = Boolean(OLLAMA_BASE_URL);
const hasGemma = Boolean(GEMMA_BASE_URL);

/**
 * Gemma.cpp provider — translates OpenAI chat format to Google API format.
 * Gemma.cpp exposes: POST /v1beta/models/{model}:generateContent
 * Request:  { systemInstruction?: { parts: [{ text }] }, contents: [{ role, parts: [{ text }] }] }
 * Response: { candidates: [{ content: { parts: [{ text }] } }] }
 */
class GemmaCppProvider implements AiProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, model = 'gemma3-270m', timeoutMs = 120_000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async chat(messages: AiMessage[]): Promise<string> {
    // Gemma.cpp does NOT support systemInstruction — it hangs the server.
    // Instead, prepend system content to the first user message.
    const systemText = messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n\n');

    const userMessages = messages.filter(m => m.role !== 'system');
    const contents = userMessages.map((m, i) => {
      let text = m.content;
      // Prepend system context to first user message
      if (i === 0 && systemText && m.role === 'user') {
        text = `${systemText}\n\n${text}`;
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text }],
      };
    });

    const body: Record<string, unknown> = {
      contents,
      generationConfig: { maxOutputTokens: 512 },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = `${this.baseUrl}/v1beta/models/${this.model}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Gemma.cpp error: ${res.status} ${await res.text()}`);
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error(`Gemma.cpp request timed out after ${this.timeoutMs}ms`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

describe.skipIf(!hasCF && !hasOllama && !hasGemma)('CTT Benchmark', () => {
  it('runs full benchmark across models and domains', async () => {
    const providers: BenchmarkProvider[] = [];

    // Cloudflare models
    if (hasCF) {
      const { CloudflareProvider } = await import('../../src/ai/providers/cloudflare.js');
      const cfModels = [
        { name: 'Llama-3.1-8B', model: '@cf/meta/llama-3.1-8b-instruct' },
        { name: 'GPT-OSS-20B', model: '@cf/openai/gpt-oss-20b' },
        { name: 'GLM-4.7-Flash', model: '@cf/zai-org/glm-4.7-flash' },
        { name: 'Granite-4.0-H-Micro', model: '@cf/ibm-granite/granite-4.0-h-micro' },
        { name: 'Qwen3-30B-A3B', model: '@cf/qwen/qwen3-30b-a3b-fp8' },
        { name: 'Llama-2-7B-INT8', model: '@cf/meta/llama-2-7b-chat-int8' },
        { name: 'Mistral-7B-v0.1', model: '@cf/mistral/mistral-7b-instruct-v0.1' },
        { name: 'Llama-2-7B-FP16', model: '@cf/meta/llama-2-7b-chat-fp16' },
      ];

      // Add large/expensive models only if explicitly requested
      if (process.env.CTT_BENCH_ALL_MODELS) {
        cfModels.push(
          { name: 'GPT-OSS-120B', model: '@cf/openai/gpt-oss-120b' },
        );
      }

      for (const m of cfModels) {
        providers.push({
          name: m.name,
          model: m.model,
          provider: new CloudflareProvider({
            accountId: CF_ACCOUNT_ID,
            apiToken: CF_API_TOKEN,
            model: m.model,
            maxTokens: 2048,
            timeoutMs: 60_000,
          }),
        });
      }
    }

    // Ollama (local Qwen3.5-2B or other)
    if (hasOllama) {
      const { OpenAiProvider } = await import('../../src/ai/providers/openai.js');
      providers.push({
        name: 'Ollama-Local',
        model: process.env.OLLAMA_MODEL ?? 'qwen3.5-2b',
        provider: new OpenAiProvider({
          apiKey: 'not-needed',
          baseUrl: OLLAMA_BASE_URL,
          model: process.env.OLLAMA_MODEL ?? 'qwen3.5-2b',
          maxTokens: 2048,
        }),
      });
    }

    // Gemma.cpp local (Google API format)
    if (hasGemma) {
      const gemmaModel = process.env.GEMMA_MODEL ?? 'gemma3-270m';
      providers.push({
        name: `Gemma-${gemmaModel}`,
        model: gemmaModel,
        provider: new GemmaCppProvider(GEMMA_BASE_URL!, gemmaModel, 300_000),
      });
    }

    expect(providers.length).toBeGreaterThan(0);

    const config: BenchmarkConfig = {
      providers,
      domains: [techStartupDomain, apiDesignDomain, customerSupportDomain],
      maxContextChars: 4000,
    };

    const report = await runBenchmark(config);

    // Output report
    console.log('\n' + report.markdown);

    // Save report to file
    const reportPath = join(process.cwd(), `ctt-benchmark-report-${report.timestamp}.md`);
    writeFileSync(reportPath, report.markdown);
    console.log(`\n[CTT-BENCH] Report saved to: ${reportPath}`);

    // Basic assertions
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.summary.avgImprovement).toBeGreaterThanOrEqual(0);

    // CTT should generally improve over base (at least on average)
    const avgCttScore = report.results.reduce((s, r) => s + r.cttScore, 0) / report.results.length;
    const avgBaseScore = report.results.reduce((s, r) => s + r.baseScore, 0) / report.results.length;
    console.log(`\n[CTT-BENCH] Overall: Base avg=${(avgBaseScore * 100).toFixed(1)}%, CTT avg=${(avgCttScore * 100).toFixed(1)}%`);

    // CTT should outperform base model (the whole point!)
    expect(avgCttScore).toBeGreaterThanOrEqual(avgBaseScore);
  }, 3_600_000); // 60 minute timeout — 8 models × 3 domains × 10 queries × 2 modes
});
