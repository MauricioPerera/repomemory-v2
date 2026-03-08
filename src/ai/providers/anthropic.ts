import type { AiProvider, AiMessage } from '../../types/ai.js';
import { RepoMemoryError } from '../../types/errors.js';

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

export interface AnthropicConfig {
  apiKey?: string;
  model?: string;
  /** Request timeout in milliseconds. Default: 120000 (2 min) */
  timeoutMs?: number;
}

export class AnthropicProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: AnthropicConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.model = config.model ?? 'claude-sonnet-4-20250514';
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async chat(messages: AiMessage[]): Promise<string> {
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
        body: JSON.stringify({ model: this.model, max_tokens: 4096, system, messages: msgs }),
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
