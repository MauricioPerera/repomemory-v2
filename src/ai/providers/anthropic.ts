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
    if (/\b(429|500|502|503|504|529)\b/.test(m)) return true;
  }
  return false;
}

export interface AnthropicConfig {
  apiKey?: string;
  model?: string;
  /** Request timeout in milliseconds. Default: 120000 (2 min) */
  timeoutMs?: number;
  /** Max tokens to generate. Default: 4096 */
  maxTokens?: number;
}

export class AnthropicProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;

  constructor(config: AnthropicConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.model = config.model ?? 'claude-sonnet-4-20250514';
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxTokens = config.maxTokens ?? 4096;
    if (!this.apiKey) {
      throw new RepoMemoryError('AI_ERROR', 'Anthropic API key required: set ANTHROPIC_API_KEY env var or pass apiKey in config');
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
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
    const msgs = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: this.model, max_tokens: this.maxTokens, system, messages: msgs }),
        signal: controller.signal,
      });
      if (!res.ok) throw new RepoMemoryError('AI_ERROR', `Anthropic error: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as { content: Array<{ text: string }> };
      return data.content[0]?.text ?? '';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new RepoMemoryError('AI_ERROR', `Anthropic request timed out after ${this.timeoutMs}ms`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
