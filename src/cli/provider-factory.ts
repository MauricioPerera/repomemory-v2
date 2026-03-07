import type { AiProvider } from '../types/ai.js';

export async function createAiProvider(provider: string, model?: string): Promise<AiProvider | null> {
  switch (provider) {
    case 'ollama': {
      const { OllamaProvider } = await import('../ai/providers/ollama.js');
      return new OllamaProvider({ model });
    }
    case 'openai': {
      const { OpenAiProvider } = await import('../ai/providers/openai.js');
      return new OpenAiProvider({ model });
    }
    case 'anthropic': {
      const { AnthropicProvider } = await import('../ai/providers/anthropic.js');
      return new AnthropicProvider({ model });
    }
    default:
      return null;
  }
}
