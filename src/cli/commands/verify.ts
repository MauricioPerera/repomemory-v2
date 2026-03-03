import { RepoMemory } from '../../index.js';
import { print, printJson } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export function cmdVerify(args: ParsedArgs): void {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const mem = new RepoMemory({ dir });
  const result = mem.verify();

  if (result.valid) {
    print(`All OK: ${result.totalObjects} objects, ${result.totalCommits} commits verified`);
  } else {
    print(`ERRORS FOUND:`);
    printJson(result);
  }
}
