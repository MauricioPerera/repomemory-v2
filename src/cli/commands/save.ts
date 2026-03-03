import { readFileSync } from 'node:fs';
import { RepoMemory } from '../../index.js';
import { print, printError } from '../output.js';
import type { ParsedArgs } from '../parser.js';

export function cmdSave(args: ParsedArgs): void {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const type = args.subcommand;
  const agentId = args.flags.agent as string;
  const userId = args.flags.user as string;
  const content = args.flags.content as string;
  const tags = args.flags.tags ? (args.flags.tags as string).split(',') : undefined;
  const category = args.flags.category as string | undefined;
  const file = args.flags.file as string | undefined;

  if (!type) { printError('Type required: memory, skill, knowledge, session, profile'); return; }
  if (!agentId) { printError('--agent required'); return; }

  const mem = new RepoMemory({ dir });

  switch (type) {
    case 'memory': {
      if (!userId) { printError('--user required for memory'); return; }
      if (!content) { printError('--content required'); return; }
      const [saved] = mem.memories.save(agentId, userId, { content, tags, category: category as 'fact' | 'decision' | 'issue' | 'task' });
      print(`Saved memory: ${saved.id}`);
      break;
    }
    case 'skill': {
      if (!content) { printError('--content required'); return; }
      const [saved] = mem.skills.save(agentId, undefined, { content, tags, category: category as 'procedure' | 'configuration' | 'troubleshooting' | 'workflow' });
      print(`Saved skill: ${saved.id}`);
      break;
    }
    case 'knowledge': {
      if (!content) { printError('--content required'); return; }
      const [saved] = mem.knowledge.save(agentId, undefined, { content, tags });
      print(`Saved knowledge: ${saved.id}`);
      break;
    }
    case 'session': {
      if (!userId) { printError('--user required for session'); return; }
      const sessionContent = file ? readFileSync(file, 'utf8') : content;
      if (!sessionContent) { printError('--content or --file required'); return; }
      const [saved] = mem.sessions.save(agentId, userId, { content: sessionContent });
      print(`Saved session: ${saved.id}`);
      break;
    }
    case 'profile': {
      if (!userId) { printError('--user required for profile'); return; }
      if (!content) { printError('--content required'); return; }
      const [saved] = mem.profiles.save(agentId, userId, { content });
      print(`Saved profile: ${saved.id}`);
      break;
    }
    default:
      printError(`Unknown type: ${type}. Use: memory, skill, knowledge, session, profile`);
  }
}
