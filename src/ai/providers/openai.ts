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

export interface OpenAiConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** Request timeout in milliseconds. Default: 120000 (2 min) */
  timeoutMs?: number;
  /** Max tokens to generate. Default: 4096 */
  maxTokens?: number;
}

export class OpenAiProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;

  constructor(config: OpenAiConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.model = config.model ?? 'gpt-4o-mini';
    this.baseUrl = config.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxTokens = config.maxTokens ?? 4096;
    // Fail fast if targeting the real OpenAI API without a key — local/custom endpoints may not need one
    if (!this.apiKey && this.baseUrl === 'https://api.openai.com/v1') {
      throw new RepoMemoryError('AI_ERROR', 'OpenAI API key required: set OPENAI_API_KEY env var or pass apiKey in config');
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, messages, max_tokens: this.maxTokens }),
        signal: controller.signal,
      });
      if (!res.ok) throw new RepoMemoryError('AI_ERROR', `OpenAI error: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content ?? '';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new RepoMemoryError('AI_ERROR', `OpenAI request timed out after ${this.timeoutMs}ms`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
