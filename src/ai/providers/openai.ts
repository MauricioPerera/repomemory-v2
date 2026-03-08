import type { AiProvider, AiMessage } from '../../types/ai.js';
import { RepoMemoryError } from '../../types/errors.js';

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

export interface OpenAiConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** Request timeout in milliseconds. Default: 120000 (2 min) */
  timeoutMs?: number;
}

export class OpenAiProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: OpenAiConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.model = config.model ?? 'gpt-4o-mini';
    this.baseUrl = config.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async chat(messages: AiMessage[]): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, messages }),
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
