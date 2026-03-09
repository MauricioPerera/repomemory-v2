import type { AiProvider, AiMessage } from '../../types/ai.js';
import { RepoMemoryError } from '../../types/errors.js';

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1000;

/** Transient errors worth retrying: network failures, rate limits, server errors */
function isTransient(e: unknown): boolean {
  if (e instanceof RepoMemoryError && e.message.includes('timed out')) return true;
  if (e instanceof TypeError) return true; // fetch network error
  if (e instanceof RepoMemoryError) {
    const m = e.message;
    if (/\b(429|500|502|503|504)\b/.test(m)) return true;
  }
  return false;
}

export interface CloudflareConfig {
  /** Cloudflare account ID. Env: CLOUDFLARE_ACCOUNT_ID */
  accountId?: string;
  /** Cloudflare API token. Env: CLOUDFLARE_API_TOKEN */
  apiToken?: string;
  /** Workers AI model ID. Default: '@cf/meta/llama-3.1-8b-instruct' */
  model?: string;
  /** Request timeout in milliseconds. Default: 120000 (2 min) */
  timeoutMs?: number;
  /** Max tokens to generate. Default: 4096 */
  maxTokens?: number;
  /** Optional AI Gateway name for analytics/caching/rate-limiting */
  gateway?: string;
}

export class CloudflareProvider implements AiProvider {
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;
  private readonly baseUrl: string;

  constructor(config: CloudflareConfig = {}) {
    this.accountId = config.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
    this.apiToken = config.apiToken ?? process.env.CLOUDFLARE_API_TOKEN ?? '';
    this.model = config.model ?? '@cf/meta/llama-3.1-8b-instruct';
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxTokens = config.maxTokens ?? 4096;

    if (!this.accountId) {
      throw new RepoMemoryError('AI_ERROR', 'Cloudflare account ID required: set CLOUDFLARE_ACCOUNT_ID env var or pass accountId in config');
    }
    if (!this.apiToken) {
      throw new RepoMemoryError('AI_ERROR', 'Cloudflare API token required: set CLOUDFLARE_API_TOKEN env var or pass apiToken in config');
    }

    // Use AI Gateway URL if configured, otherwise direct Workers AI OpenAI-compatible endpoint
    if (config.gateway) {
      this.baseUrl = `https://gateway.ai.cloudflare.com/v1/${this.accountId}/${config.gateway}`;
    } else {
      this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/v1`;
    }
  }

  async chat(messages: AiMessage[]): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.doChat(messages);
      } catch (e) {
        lastError = e;
        if (attempt < MAX_RETRIES && isTransient(e)) {
          const delay = RETRY_BASE_MS * Math.pow(2, attempt) + Math.random() * 500;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw e;
      }
    }
    throw lastError;
  }

  private async doChat(messages: AiMessage[]): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiToken}` },
        body: JSON.stringify({ model: this.model, messages, max_tokens: this.maxTokens }),
        signal: controller.signal,
      });
      if (!res.ok) throw new RepoMemoryError('AI_ERROR', `Cloudflare Workers AI error: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content ?? '';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new RepoMemoryError('AI_ERROR', `Cloudflare request timed out after ${this.timeoutMs}ms`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
