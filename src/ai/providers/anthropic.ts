import type { AiProvider, AiMessage } from '../../types/ai.js';
import { RepoMemoryError } from '../../types/errors.js';

export interface AnthropicConfig {
  apiKey?: string;
  model?: string;
}

export class AnthropicProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: AnthropicConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.model = config.model ?? 'claude-sonnet-4-20250514';
  }

  async chat(messages: AiMessage[]): Promise<string> {
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
    const msgs = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: this.model, max_tokens: 4096, system, messages: msgs }),
    });
    if (!res.ok) throw new RepoMemoryError('AI_ERROR', `Anthropic error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { content: Array<{ text: string }> };
    return data.content[0]?.text ?? '';
  }
}
