import type { AiProvider, AiMessage } from '../../types/ai.js';
import { RepoMemoryError } from '../../types/errors.js';

export interface OllamaConfig {
  model?: string;
  baseUrl?: string;
}

export class OllamaProvider implements AiProvider {
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: OllamaConfig = {}) {
    this.model = config.model ?? 'llama3.1';
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
  }

  async chat(messages: AiMessage[]): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, messages, stream: false }),
    });
    if (!res.ok) throw new RepoMemoryError('AI_ERROR', `Ollama error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { message: { content: string } };
    return data.message?.content ?? '';
  }
}
