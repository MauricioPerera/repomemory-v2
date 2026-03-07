import { writeFileSync } from 'node:fs';
import { RepoMemory } from '../../index.js';
import { print, printError } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export function cmdExport(args: ParsedArgs): void {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const outFile = (args.flags.output as string) ?? args.subcommand;

  if (!outFile) {
    printError('Output file required: repomemory export <file.json> or --output <file.json>');
    return;
  }

  const mem = new RepoMemory({ dir });
  const data = mem.export();

  writeFileSync(outFile, JSON.stringify(data, null, 2), 'utf8');

  const total =
    data.entities.memories.length +
    data.entities.skills.length +
    data.entities.knowledge.length +
    data.entities.sessions.length +
    data.entities.profiles.length;

  print(`Exported ${total} entities to ${outFile}`);
}
