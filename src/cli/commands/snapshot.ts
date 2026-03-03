import { RepoMemory } from '../../index.js';
import { print, printJson, printError } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export function cmdSnapshot(args: ParsedArgs): void {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const action = args.subcommand ?? 'list';

  const mem = new RepoMemory({ dir });

  switch (action) {
    case 'create': {
      const label = args.positional[0] ?? `snapshot-${Date.now()}`;
      const snap = mem.snapshot(label);
      print(`Created snapshot: ${snap.id} (${snap.label})`);
      break;
    }
    case 'list': {
      const snapshots = mem.listSnapshots();
      if (snapshots.length === 0) {
        print('No snapshots');
      } else {
        printJson(snapshots);
      }
      break;
    }
    case 'restore': {
      const id = args.positional[0];
      if (!id) { printError('Snapshot ID required'); return; }
      mem.restore(id);
      print(`Restored snapshot: ${id}`);
      break;
    }
    default:
      printError(`Unknown action: ${action}. Use: create, list, restore`);
  }
}
