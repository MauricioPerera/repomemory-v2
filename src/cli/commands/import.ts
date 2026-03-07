import { readFileSync } from 'node:fs';
import { RepoMemory } from '../../index.js';
import type { ExportData } from '../../index.js';
import { print, printError } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export function cmdImport(args: ParsedArgs): void {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const inFile = args.subcommand;
  const skipExisting = args.flags['skip-existing'] === true;

  if (!inFile) {
    printError('Input file required: repomemory import <file.json>');
    return;
  }

  let data: ExportData;
  try {
    data = JSON.parse(readFileSync(inFile, 'utf8'));
  } catch {
    printError(`Failed to read or parse ${inFile}`);
    return;
  }

  const mem = new RepoMemory({ dir });
  const report = mem.import(data, { skipExisting });

  print(`Imported: ${report.imported}, Skipped: ${report.skipped}, Overwritten: ${report.overwritten}`);
  print(`  memories: ${report.byType.memories}, skills: ${report.byType.skills}, knowledge: ${report.byType.knowledge}, sessions: ${report.byType.sessions}, profiles: ${report.byType.profiles}`);
}
