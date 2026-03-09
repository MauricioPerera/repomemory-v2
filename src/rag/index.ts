import type { RepoMemory } from '../index.js';
import type { AiProvider } from '../types/ai.js';
import type { ChunkOptions, ChunkStrategy } from './chunker.js';
import type { IngestOptions, IngestResult } from './ingest.js';
import type { QueryOptions, QueryResult } from './query.js';
import type { SyncResult } from './sync.js';
import { ingestPath } from './ingest.js';
import { queryKnowledge, queryWithAi } from './query.js';
import { syncDirectory } from './sync.js';

// ---------------------------------------------------------------------------
// RagPipeline config
// ---------------------------------------------------------------------------

export interface RagPipelineConfig extends ChunkOptions {
  /** Optional AI provider for answer generation */
  ai?: AiProvider;
}

// ---------------------------------------------------------------------------
// RagPipeline
// ---------------------------------------------------------------------------

export class RagPipeline {
  private readonly mem: RepoMemory;
  private readonly chunkSize: number;
  private readonly overlap: number;
  private readonly strategy: ChunkStrategy;
  private readonly ai?: AiProvider;

  constructor(mem: RepoMemory, config?: RagPipelineConfig) {
    this.mem = mem;
    this.chunkSize = config?.chunkSize ?? 1000;
    this.overlap = config?.overlap ?? 200;
    this.strategy = config?.strategy ?? 'paragraph';
    this.ai = config?.ai;
  }

  /** Ingest a file or directory into the knowledge store. */
  async ingest(
    path: string,
    options: { agent: string } & Partial<Omit<IngestOptions, 'agent'>>,
  ): Promise<IngestResult> {
    return ingestPath(this.mem, path, {
      chunkSize: this.chunkSize,
      overlap: this.overlap,
      strategy: this.strategy,
      ...options,
    });
  }

  /** Query knowledge chunks. If AI is configured, generates an answer. */
  async query(
    agentId: string,
    query: string,
    options?: QueryOptions,
  ): Promise<QueryResult> {
    if (this.ai) {
      return queryWithAi(this.mem, this.ai, agentId, query, options);
    }
    return queryKnowledge(this.mem, agentId, query, options);
  }

  /** Sync a directory: detect changes, re-ingest modified/new, remove deleted. */
  async sync(
    dirPath: string,
    options: { agent: string } & Partial<Omit<IngestOptions, 'agent'>>,
  ): Promise<SyncResult> {
    return syncDirectory(this.mem, dirPath, {
      chunkSize: this.chunkSize,
      overlap: this.overlap,
      strategy: this.strategy,
      ...options,
    });
  }
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { chunkText, detectStrategy } from './chunker.js';
export type { Chunk, ChunkOptions, ChunkStrategy } from './chunker.js';
export { loadFile, loadDirectory } from './loader.js';
export type { LoadedFile, LoadOptions } from './loader.js';
export { ingestPath } from './ingest.js';
export type { IngestOptions, IngestResult } from './ingest.js';
export { queryKnowledge, queryWithAi } from './query.js';
export type { QueryOptions, QueryResult } from './query.js';
export { syncDirectory } from './sync.js';
export type { SyncResult } from './sync.js';
