import { RepoMemory } from '../../index.js';
import { printJson, printError } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export function cmdHistory(args: ParsedArgs): void {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const entityId = args.subcommand;

  if (!entityId) { printError('Entity ID required'); return; }

  const mem = new RepoMemory({ dir });

  try {
    const history = mem.memories.history(entityId);
    printJson(history);
  } catch {
    printError(`Entity not found: ${entityId}`);
  }
}
