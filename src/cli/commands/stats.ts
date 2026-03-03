import { RepoMemory } from '../../index.js';
import { printJson } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export function cmdStats(args: ParsedArgs): void {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const mem = new RepoMemory({ dir });
  printJson(mem.stats());
}
