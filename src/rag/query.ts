import type { RepoMemory } from '../index.js';
import type { AiProvider } from '../types/ai.js';
import type { Knowledge } from '../types/entities.js';
import type { SearchResult } from '../types/results.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueryOptions {
  /** Max chunks to retrieve. Default: 10 */
  limit?: number;
  /** Include shared knowledge. Default: false */
  includeShared?: boolean;
  /** Filter to specific source file paths */
  sourceFilter?: string[];
  /** Maximum context chars to pass to AI. Default: 8000 */
  maxContextChars?: number;
}

export interface QueryResult {
  /** Retrieved knowledge chunks, ranked by relevance */
  chunks: Array<SearchResult<Knowledge>>;
  /** Formatted context string */
  context: string;
  /** AI-generated answer (null if no AI) */
  answer: string | null;
  /** Number of chunks used for context */
  chunksUsed: number;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

const RAG_SYSTEM = `You are a helpful assistant. Answer the user's question based ONLY on the provided context. If the context does not contain enough information to answer, say so. Do not make up information.`;

function formatContext(chunks: Array<SearchResult<Knowledge>>, maxChars: number): { context: string; used: number } {
  const parts: string[] = [];
  let total = 0;
  let used = 0;

  for (const { entity } of chunks) {
    const header = `--- Source: ${entity.source ?? 'unknown'} (chunk ${entity.chunkIndex ?? '?'}) ---`;
    const block = `${header}\n${entity.content}\n`;
    if (total + block.length > maxChars && used > 0) break;
    parts.push(block);
    total += block.length;
    used++;
  }

  return { context: parts.join('\n'), used };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Query knowledge chunks without AI. Returns relevant chunks and formatted context. */
export function queryKnowledge(
  mem: RepoMemory,
  agentId: string,
  query: string,
  options?: QueryOptions,
): QueryResult {
  const limit = options?.limit ?? 10;
  const includeShared = options?.includeShared ?? false;
  const maxContextChars = options?.maxContextChars ?? 8000;

  let chunks = mem.knowledge.search(agentId, query, limit, includeShared);

  // Apply source filter if specified
  if (options?.sourceFilter && options.sourceFilter.length > 0) {
    const filterSet = new Set(options.sourceFilter);
    chunks = chunks.filter(({ entity }) => entity.source && filterSet.has(entity.source));
  }

  const { context, used } = formatContext(chunks, maxContextChars);

  return { chunks, context, answer: null, chunksUsed: used };
}

/** Query knowledge chunks with AI answer generation. */
export async function queryWithAi(
  mem: RepoMemory,
  ai: AiProvider,
  agentId: string,
  query: string,
  options?: QueryOptions,
): Promise<QueryResult> {
  const result = queryKnowledge(mem, agentId, query, options);

  if (result.chunksUsed === 0) {
    return { ...result, answer: 'No relevant context found to answer this question.' };
  }

  const messages = [
    { role: 'system' as const, content: RAG_SYSTEM },
    { role: 'user' as const, content: `Context:\n${result.context}\n\nQuestion: ${query}` },
  ];

  const answer = await ai.chat(messages);
  return { ...result, answer };
}
