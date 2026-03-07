import { parseArgs } from './cli/parser.js';
import { cmdInit } from './cli/commands/init.js';
import { cmdSave } from './cli/commands/save.js';
import { cmdSearch } from './cli/commands/search.js';
import { cmdGet } from './cli/commands/get.js';
import { cmdList } from './cli/commands/list.js';
import { cmdHistory } from './cli/commands/history.js';
import { cmdSnapshot } from './cli/commands/snapshot.js';
import { cmdMine } from './cli/commands/mine.js';
import { cmdConsolidate } from './cli/commands/consolidate.js';
import { cmdStats } from './cli/commands/stats.js';
import { cmdVerify } from './cli/commands/verify.js';
import { cmdExport } from './cli/commands/export.js';
import { cmdImport } from './cli/commands/import.js';
import { cmdRecall } from './cli/commands/recall.js';
import { cmdCleanup } from './cli/commands/cleanup.js';
import { print, printError } from './cli/output.js';

const HELP = `repomemory v2 — Git-inspired agentic memory

Commands:
  init [--dir <path>]                                Initialize storage
  save <type> --agent <id> [--user <id>] ...         Save an entity
  search <query> --agent <id> [--user <id>] ...      Search entities
  get <entityId>                                     Get entity by ID
  list <type> --agent <id> [--user <id>]             List entities
  history <entityId>                                 Show entity history
  snapshot create|list|restore <id>                  Manage snapshots
  mine <sessionId> [--provider ollama] [--model ..]  Mine a session (AI)
  consolidate --agent <id> --user <id>               Consolidate memories (AI)
  recall <query> --agent <id> --user <id>            Recall context for an agent
  cleanup [--max-age 90] [--dry-run]                 Remove stale entities
  export <file.json>                                 Export all entities to file
  import <file.json> [--skip-existing]               Import entities from file
  stats                                              Show storage stats
  verify                                             Verify storage integrity`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  switch (args.command) {
    case 'init': cmdInit(args); break;
    case 'save': cmdSave(args); break;
    case 'search': cmdSearch(args); break;
    case 'get': cmdGet(args); break;
    case 'list': cmdList(args); break;
    case 'history': cmdHistory(args); break;
    case 'snapshot': cmdSnapshot(args); break;
    case 'mine': await cmdMine(args); break;
    case 'consolidate': await cmdConsolidate(args); break;
    case 'recall': cmdRecall(args); break;
    case 'cleanup': cmdCleanup(args); break;
    case 'export': cmdExport(args); break;
    case 'import': cmdImport(args); break;
    case 'stats': cmdStats(args); break;
    case 'verify': cmdVerify(args); break;
    case 'help': case '--help': case '-h': print(HELP); break;
    default: printError(`Unknown command: ${args.command}\n`); print(HELP); process.exitCode = 1;
  }
}

main().catch(err => {
  printError(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
