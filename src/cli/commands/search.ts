import { RepoMemory } from '../../index.js';
import { printJson, printError } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export function cmdSearch(args: ParsedArgs): void {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const query = args.subcommand ?? args.positional[0];
  const agentId = args.flags.agent as string;
  const userId = args.flags.user as string | undefined;
  const type = (args.flags.type as string) ?? 'memories';
  const limit = parseInt(args.flags.limit as string) || 5;

  if (!query) { printError('Query required'); return; }
  if (!agentId) { printError('--agent required'); return; }

  const mem = new RepoMemory({ dir });

  let results;
  switch (type) {
    case 'memories':
      results = mem.memories.search(agentId, userId ?? '', query, limit);
      break;
    case 'skills':
      results = mem.skills.search(agentId, query, limit);
      break;
    case 'knowledge':
      results = mem.knowledge.search(agentId, query, limit);
      break;
    default:
      printError(`Unknown type: ${type}`);
      return;
  }

  printJson(results.map(r => ({ id: r.entity.id, score: Math.round(r.score * 1000) / 1000, content: r.entity.content })));
}
