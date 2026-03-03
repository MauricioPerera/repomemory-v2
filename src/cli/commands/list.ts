import { RepoMemory } from '../../index.js';
import { printJson, printError } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export function cmdList(args: ParsedArgs): void {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const type = args.subcommand;
  const agentId = args.flags.agent as string;
  const userId = args.flags.user as string | undefined;

  if (!type) { printError('Type required: memories, skills, knowledge, sessions, profiles'); return; }
  if (!agentId) { printError('--agent required'); return; }

  const mem = new RepoMemory({ dir });

  let entities;
  switch (type) {
    case 'memories': entities = mem.memories.list(agentId, userId); break;
    case 'skills': entities = mem.skills.list(agentId); break;
    case 'knowledge': entities = mem.knowledge.list(agentId); break;
    case 'sessions': entities = mem.sessions.list(agentId, userId); break;
    case 'profiles': entities = mem.profiles.list(agentId, userId); break;
    default: printError(`Unknown type: ${type}`); return;
  }

  printJson(entities.map(e => ({ id: e.id, type: e.type, content: ('content' in e ? (e.content as string).slice(0, 100) : ''), updatedAt: e.updatedAt })));
}
