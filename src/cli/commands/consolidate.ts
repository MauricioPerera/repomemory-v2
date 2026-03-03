import { RepoMemory } from '../../index.js';
import { print, printJson, printError } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export async function cmdConsolidate(args: ParsedArgs): Promise<void> {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const agentId = args.flags.agent as string;
  const userId = args.flags.user as string | undefined;
  const provider = (args.flags.provider as string) ?? 'ollama';
  const model = args.flags.model as string | undefined;
  const type = (args.flags.type as string) ?? 'memories';

  if (!agentId) { printError('--agent required'); return; }
  if (type === 'memories' && !userId) { printError('--user required for memory consolidation'); return; }

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

  switch (type) {
    case 'memories': {
      const report = await mem.consolidate(agentId, userId!);
      print(`Consolidation (memories): merged=${report.merged}, removed=${report.removed}, kept=${report.kept}`);
      printJson(report);
      break;
    }
    case 'skills': {
      const report = await mem.consolidateSkills(agentId);
      print(`Consolidation (skills): merged=${report.merged}, removed=${report.removed}, kept=${report.kept}`);
      printJson(report);
      break;
    }
    case 'knowledge': {
      const report = await mem.consolidateKnowledge(agentId);
      print(`Consolidation (knowledge): merged=${report.merged}, removed=${report.removed}, kept=${report.kept}`);
      printJson(report);
      break;
    }
    default:
      printError(`Unknown type: ${type}. Use: memories, skills, or knowledge`);
  }
}
