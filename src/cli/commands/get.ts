import { RepoMemory } from '../../index.js';
import { printJson, printError } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export function cmdGet(args: ParsedArgs): void {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const entityId = args.subcommand;

  if (!entityId) { printError('Entity ID required'); return; }

  const mem = new RepoMemory({ dir });

  const entity =
    mem.memories.get(entityId) ??
    mem.skills.get(entityId) ??
    mem.knowledge.get(entityId) ??
    mem.sessions.get(entityId) ??
    mem.profiles.get(entityId);

  if (!entity) {
    printError(`Entity not found: ${entityId}`);
    return;
  }

  printJson(entity);
}
