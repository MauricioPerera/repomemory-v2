import type { AiProvider, AiMessage } from '../../types/ai.js';
import { RepoMemoryError } from '../../types/errors.js';

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

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
