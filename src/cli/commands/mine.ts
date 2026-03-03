import { RepoMemory } from '../../index.js';
import { print, printJson, printError } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export async function cmdMine(args: ParsedArgs): Promise<void> {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const sessionId = args.subcommand;
  const provider = (args.flags.provider as string) ?? 'ollama';
  const model = args.flags.model as string | undefined;

  if (!sessionId) { printError('Session ID required'); return; }

  let ai;
  switch (provider) {
    case 'ollama': {
      const { OllamaProvider } = await import('../../ai/providers/ollama.js');
      ai = new OllamaProvider({ model });
      break;
    }
    case 'openai': {
      const { OpenAiProvider } = await import('../../ai/providers/openai.js');
      ai = new OpenAiProvider({ model });
      break;
    }
    case 'anthropic': {
      const { AnthropicProvider } = await import('../../ai/providers/anthropic.js');
      ai = new AnthropicProvider({ model });
      break;
    }
    default:
      printError(`Unknown provider: ${provider}`);
      return;
  }

  const mem = new RepoMemory({ dir, ai });
  const result = await mem.mine(sessionId);
  print(`Mined ${result.memories.length} memories, ${result.skills.length} skills`);
  printJson(result);
}
