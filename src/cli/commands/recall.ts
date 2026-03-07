import { RepoMemory } from '../../index.js';
import { print, printError } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export function cmdRecall(args: ParsedArgs): void {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const query = args.subcommand;
  const agentId = args.flags.agent as string;
  const userId = args.flags.user as string;
  const maxItems = args.flags['max-items'] ? Number(args.flags['max-items']) : undefined;
  const maxChars = args.flags['max-chars'] ? Number(args.flags['max-chars']) : undefined;

  if (!query) { printError('Query required: repomemory recall <query> --agent <id> --user <id>'); return; }
  if (!agentId) { printError('--agent required'); return; }
  if (!userId) { printError('--user required'); return; }

  const mem = new RepoMemory({ dir });
  const ctx = mem.recall(agentId, userId, query, { maxItems, maxChars });

  print(ctx.formatted);
  print(`\n--- ${ctx.totalItems} items, ~${ctx.estimatedChars} chars ---`);
  mem.flush();
}
