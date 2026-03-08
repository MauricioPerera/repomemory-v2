import { RepoMemory } from '../../index.js';
import { print, printJson, printError } from '../output.js';
import { createAiProvider } from '../provider-factory.js';
import type { ParsedArgs } from '../parser.js';

export async function cmdMine(args: ParsedArgs): Promise<void> {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const sessionId = args.subcommand;
  const provider = (args.flags.provider as string) ?? 'ollama';
  const model = args.flags.model as string | undefined;
  const baseUrl = args.flags['base-url'] as string | undefined;

  if (!sessionId) { printError('Session ID required'); return; }

  const ai = await createAiProvider(provider, model, baseUrl);
  if (!ai) { printError(`Unknown provider: ${provider}`); return; }

  const mem = new RepoMemory({ dir, ai });
  const result = await mem.mine(sessionId);
  print(`Mined ${result.memories.length} memories, ${result.skills.length} skills`);
  printJson(result);
}
