import { RepoMemory } from '../../index.js';
import { print, printJson, printError } from '../output.js';
import { createAiProvider } from '../provider-factory.js';
import type { ParsedArgs } from '../parser.js';

export async function cmdRag(args: ParsedArgs): Promise<void> {
  const dir = (args.flags.dir as string) ?? '.repomemory';
  const sub = args.subcommand;
  const agentId = args.flags.agent as string | undefined;

  if (!agentId) {
    printError('--agent is required for all rag commands');
    return;
  }

  switch (sub) {
    case 'ingest': {
      const path = args.positional[0];
      if (!path) { printError('Path required: rag ingest <path> --agent <id>'); return; }

      const { ingestPath } = await import('../../rag/ingest.js');
      const chunkSize = args.flags['chunk-size'] ? Number(args.flags['chunk-size']) : undefined;
      const overlap = args.flags.overlap ? Number(args.flags.overlap) : undefined;
      const strategy = args.flags.strategy as string | undefined;

      const mem = new RepoMemory({ dir });
      const result = ingestPath(mem, path, {
        agent: agentId,
        ...(chunkSize ? { chunkSize } : {}),
        ...(overlap != null ? { overlap } : {}),
        ...(strategy ? { strategy: strategy as 'fixed' | 'paragraph' | 'markdown' } : {}),
      });
      mem.dispose();

      print(`Ingested ${result.filesProcessed} files → ${result.chunksIngested} chunks (${result.chunksCreated} new, ${result.chunksDeduplicated} updated)`);
      if (result.skipped.length > 0) {
        print(`Skipped ${result.skipped.length} files`);
      }
      printJson(result);
      break;
    }

    case 'query': {
      const query = args.positional[0];
      if (!query) { printError('Query required: rag query <query> --agent <id>'); return; }

      const provider = args.flags.provider as string | undefined;
      const model = args.flags.model as string | undefined;
      const baseUrl = args.flags['base-url'] as string | undefined;
      const limit = args.flags.limit ? Number(args.flags.limit) : undefined;

      let ai;
      if (provider) {
        ai = await createAiProvider(provider, model, baseUrl);
        if (!ai) { printError(`Unknown provider: ${provider}`); return; }
      }

      const mem = new RepoMemory({ dir, ai: ai ?? undefined });
      const { RagPipeline } = await import('../../rag/index.js');
      const rag = new RagPipeline(mem, { ai: ai ?? undefined });
      const result = await rag.query(agentId, query, { limit });
      mem.dispose();

      if (result.answer) {
        print(`\nAnswer: ${result.answer}\n`);
      }
      print(`Found ${result.chunksUsed} relevant chunks`);
      printJson(result);
      break;
    }

    case 'sync': {
      const path = args.positional[0];
      if (!path) { printError('Path required: rag sync <path> --agent <id>'); return; }

      const { syncDirectory } = await import('../../rag/sync.js');
      const chunkSize = args.flags['chunk-size'] ? Number(args.flags['chunk-size']) : undefined;
      const overlap = args.flags.overlap ? Number(args.flags.overlap) : undefined;

      const mem = new RepoMemory({ dir });
      const result = syncDirectory(mem, path, {
        agent: agentId,
        ...(chunkSize ? { chunkSize } : {}),
        ...(overlap != null ? { overlap } : {}),
      });
      mem.dispose();

      print(`Sync: ${result.unchangedFiles} unchanged, ${result.modifiedFiles} modified, ${result.newFiles} new, ${result.deletedFiles} deleted`);
      print(`Chunks: ${result.chunksCreated} created, ${result.chunksRemoved} removed`);
      printJson(result);
      break;
    }

    case 'status': {
      const mem = new RepoMemory({ dir });
      const all = mem.knowledge.list(agentId);
      const ragChunks = all.filter(k => k.source != null && k.chunkIndex != null);
      const sources = new Set(ragChunks.map(k => k.source));
      mem.dispose();

      print(`RAG status for agent "${agentId}":`);
      print(`  Total knowledge: ${all.length}`);
      print(`  RAG chunks: ${ragChunks.length}`);
      print(`  Unique sources: ${sources.size}`);
      if (sources.size > 0) {
        print('  Sources:');
        for (const src of sources) {
          print(`    - ${src}`);
        }
      }
      break;
    }

    default:
      printError(`Unknown rag subcommand: ${sub}`);
      print('Usage: rag ingest|query|sync|status --agent <id> ...');
  }
}
