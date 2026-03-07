import { RepoMemory } from '../../index.js';
import { print, printJson } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export function cmdCleanup(args: ParsedArgs): void {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const maxAgeDays = args.flags['max-age'] ? Number(args.flags['max-age']) : undefined;
  const maxAuditLines = args.flags['max-audit'] ? Number(args.flags['max-audit']) : undefined;
  const dryRun = args.flags['dry-run'] === true;

  const mem = new RepoMemory({ dir });
  const report = mem.cleanup({ maxAgeDays, maxAuditLines, dryRun });

  if (dryRun) {
    print('Dry run — no changes made:');
  }
  printJson(report);
}
