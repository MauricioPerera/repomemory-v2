/**
 * CTT Benchmark Test
 *
 * Skipped by default — requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars.
 * Run manually:
 *   CLOUDFLARE_ACCOUNT_ID=xxx CLOUDFLARE_API_TOKEN=yyy npx vitest run tests/ctt-benchmark
 *
 * For Ollama (local/VPS):
 *   OLLAMA_BASE_URL=http://localhost:8080 npx vitest run tests/ctt-benchmark
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runBenchmark } from './runner.js';
import { techStartupDomain } from './domains/techstartup.js';
import { apiDesignDomain } from './domains/api-design.js';
import { customerSupportDomain } from './domains/customer-support.js';
import type { BenchmarkConfig, BenchmarkProvider } from './types.js';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL; // e.g., http://localhost:8080

const hasCF = Boolean(CF_ACCOUNT_ID && CF_API_TOKEN);
const hasOllama = Boolean(OLLAMA_BASE_URL);

describe.skipIf(!hasCF && !hasOllama)('CTT Benchmark', () => {
  it('runs full benchmark across models and domains', async () => {
    const providers: BenchmarkProvider[] = [];

    // Cloudflare models
    if (hasCF) {
      const { CloudflareProvider } = await import('../../src/ai/providers/cloudflare.js');
      const cfModels = [
        { name: 'Llama-3.1-8B', model: '@cf/meta/llama-3.1-8b-instruct' },
        { name: 'Mistral-7B', model: '@cf/mistral/mistral-7b-instruct-v0.2' },
      ];

      // Add large models only if explicitly requested
      if (process.env.CTT_BENCH_ALL_MODELS) {
        cfModels.push(
          { name: 'GPT-OSS-20B', model: '@cf/openai/gpt-oss-20b' },
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
  }, 300_000); // 5 minute timeout for API calls
});
