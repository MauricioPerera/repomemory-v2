import { RepoMemory } from '../../index.js';
import { print } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export function cmdInit(args: ParsedArgs): void {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  new RepoMemory({ dir });
  print(`Initialized repomemory at ${dir}`);
}
