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

export interface OllamaConfig {
  model?: string;
  baseUrl?: string;
  /** Disable reasoning/thinking for reasoning models (e.g., qwen3.5). Default: true (thinking disabled) */
  disableThinking?: boolean;
  /** Max tokens to generate. Default: 2048 */
  numPredict?: number;
  /** Context window size. Default: 4096 */
  numCtx?: number;
  /** Request timeout in milliseconds. Default: 120000 (2 min) */
  timeoutMs?: number;
}

export class OllamaProvider implements AiProvider {
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly disableThinking: boolean;
  private readonly numPredict: number;
  private readonly numCtx: number;
  private readonly timeoutMs: number;

  constructor(config: OllamaConfig = {}) {
    this.model = config.model ?? 'llama3.1';
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
    this.disableThinking = config.disableThinking ?? true;
    this.numPredict = config.numPredict ?? 2048;
    this.numCtx = config.numCtx ?? 4096;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
      options: {
        num_predict: this.numPredict,
        num_ctx: this.numCtx,
      },
    };

    // For reasoning models (qwen3, deepseek-r1, etc.), disable thinking
    // so they output content directly instead of burning tokens on internal reasoning
    if (this.disableThinking) {
      body.think = false;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new RepoMemoryError('AI_ERROR', `Ollama error: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as { message: { content: string } };
      return data.message?.content ?? '';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new RepoMemoryError('AI_ERROR', `Ollama request timed out after ${this.timeoutMs}ms`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
