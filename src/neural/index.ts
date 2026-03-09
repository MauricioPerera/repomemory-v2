/**
 * NeuralEngine — Public facade for the Neural Context Curator.
 *
 * Wires Embedder + EmbeddingStore + MatryoshkaRanker + ContextCurator.
 * Provides lazy model loading, graceful error handling, and a clean API.
 *
 * Usage:
 *   import { NeuralEngine } from 'repomemory/neural';
 *
 *   const engine = new NeuralEngine(baseDir, { enabled: true });
 *   const ready = await engine.ensureReady();
 *   if (ready) {
 *     await engine.index('memories:agent1:user1', 'mem-123', 'Uses PostgreSQL');
 *     const results = await engine.rank('memories:agent1:user1', 'database', 5);
 *   }
 */

import type { NeuralConfig, NeuralStats, MatryoshkaEmbedding, CuratedItem, SimilarityResult } from './types.js';
import { Embedder } from './embedder.js';
import { EmbeddingStore } from './store.js';
import { MatryoshkaRanker } from './ranker.js';
import { ContextCurator } from './curator.js';

const DEFAULT_DIMS: [number, number, number] = [128, 256, 768];

export class NeuralEngine {
  private readonly embedder: Embedder;
  private readonly store: EmbeddingStore;
  private readonly ranker: MatryoshkaRanker;
  private readonly curator: ContextCurator;
  private readonly config: NeuralConfig;
  private initError: Error | null = null;

  constructor(baseDir: string, config: NeuralConfig) {
    this.config = config;
    this.embedder = new Embedder(config);
    this.store = new EmbeddingStore(baseDir, config.maxLoadedScopes);
    this.ranker = new MatryoshkaRanker(this.store, this.embedder, config.dimensions);
    this.curator = new ContextCurator(this.ranker, this.store, this.embedder);
    this.store.init();
  }

  /**
   * Ensure the model is loaded. Call once before using embedding features.
   * Returns true if ready, false if loading failed (check lastError).
   */
  async ensureReady(): Promise<boolean> {
    try {
      await this.embedder.ensureLoaded();
      this.initError = null;
      return true;
    } catch (e) {
      this.initError = e instanceof Error ? e : new Error(String(e));
      return false;
    }
  }

  /** Whether the engine is ready (model loaded, no errors) */
  get isReady(): boolean {
    return this.embedder.isLoaded && this.initError === null;
  }

  /** Last initialization error, if any */
  get lastError(): Error | null {
    return this.initError;
  }

  /** Generate embeddings at all 3 Matryoshka resolutions */
  async embed(text: string): Promise<MatryoshkaEmbedding> {
    this.requireReady();
    return this.embedder.embedMultiRes(text);
  }

  /** Index an entity's content in the embedding store */
  async index(scope: string, entityId: string, content: string): Promise<void> {
    this.requireReady();
    const vector = await this.embedder.embed(content);
    this.store.set(scope, entityId, vector);
  }

  /** Batch index multiple entities (more efficient than sequential index calls) */
  async indexBatch(scope: string, items: Array<{ entityId: string; content: string }>): Promise<number> {
    if (items.length === 0) return 0;
    this.requireReady();
    const texts = items.map(i => i.content);
    const vectors = await this.embedder.embedBatch(texts);
    for (let i = 0; i < items.length; i++) {
      this.store.set(scope, items[i].entityId, vectors[i]);
    }
    return items.length;
  }

  /** Remove an entity from the embedding store */
  remove(scope: string, entityId: string): boolean {
    return this.store.remove(scope, entityId);
  }

  /** Matryoshka 3-level ranked search within a scope */
  async rank(scope: string, query: string, limit: number): Promise<SimilarityResult[]> {
    this.requireReady();
    return this.ranker.rank(scope, query, limit);
  }

  /** Multi-scope ranked search */
  async rankMultiScope(scopes: string[], query: string, limit: number): Promise<SimilarityResult[]> {
    this.requireReady();
    return this.ranker.rankMultiScope(scopes, query, limit);
  }

  /** Direct semantic similarity between two texts (0 to 1) */
  async similarity(textA: string, textB: string): Promise<number> {
    this.requireReady();
    return this.ranker.similarity(textA, textB);
  }

  /** Curate context: rank + MMR diversity filter for LLM context windows */
  async curateContext<T extends { id: string; content: string }>(
    query: string,
    candidates: T[],
    maxItems: number,
  ): Promise<CuratedItem<T>[]> {
    this.requireReady();
    return this.curator.curate(query, candidates, maxItems);
  }

  /** Curate from scope: rank + diversity filter using stored embeddings */
  async curateFromScope(scope: string, query: string, maxItems: number): Promise<SimilarityResult[]> {
    this.requireReady();
    return this.curator.curateFromScope(scope, query, maxItems);
  }

  /** Persist all dirty embedding indices to disk */
  flush(): void {
    this.store.flush();
  }

  /** Diagnostic stats */
  stats(): NeuralStats {
    const storeStats = this.store.stats();
    return {
      modelLoaded: this.embedder.isLoaded,
      modelId: this.config.model ?? 'onnx-community/embeddinggemma-300m-ONNX',
      dtype: this.config.dtype ?? 'q8',
      dimensions: this.config.dimensions ?? [...DEFAULT_DIMS],
      totalVectors: storeStats.totalVectors,
      loadedScopes: storeStats.loadedScopes,
      estimatedMemoryMB: storeStats.estimatedMemoryMB,
    };
  }

  /** Vector count for a specific scope */
  count(scope: string): number {
    return this.store.count(scope);
  }

  private requireReady(): void {
    if (!this.embedder.isLoaded) {
      throw new Error('Neural engine not ready. Call ensureReady() first.');
    }
  }
}

// Re-exports
export type { NeuralConfig, NeuralStats, MatryoshkaEmbedding, CuratedItem, SimilarityResult, EmbeddingRecord, EmbeddingManifest } from './types.js';
export { Embedder } from './embedder.js';
export { EmbeddingStore, cosineSimilarity } from './store.js';
export { MatryoshkaRanker } from './ranker.js';
export { ContextCurator } from './curator.js';
