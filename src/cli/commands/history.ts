import { RepoMemory } from '../../index.js';
import { printJson, printError } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export function cmdHistory(args: ParsedArgs): void {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const entityId = args.subcommand;

  if (!entityId) { printError('Entity ID required'); return; }

  const mem = new RepoMemory({ dir });

  // Try all collections — entity ID prefix tells us the type, but try all as fallback
  const collections = [mem.memories, mem.skills, mem.knowledge, mem.sessions, mem.profiles];
  for (const col of collections) {
    try {
      const history = col.history(entityId);
      printJson(history);
      return;
    } catch { /* not in this collection, try next */ }
  }
  printError(`Entity not found: ${entityId}`);
}
