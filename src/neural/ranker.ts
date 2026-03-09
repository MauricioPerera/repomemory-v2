/**
 * MatryoshkaRanker — 3-level pyramid ranking using Matryoshka embeddings.
 *
 * Level 1 (128 dims): Coarse scan of all vectors → top 50
 * Level 2 (256 dims): Re-rank top 50 → top 15
 * Level 3 (768 dims): Precise rank top 15 → top N
 *
 * This is ~6× faster than full-dimension brute-force for 1000+ entity scopes.
 */

import type { EmbeddingStore } from './store.js';
import type { Embedder } from './embedder.js';
import type { SimilarityResult } from './types.js';
import { cosineSimilarity } from './store.js';

const DEFAULT_DIMS: [number, number, number] = [128, 256, 768];
const DEFAULT_LEVEL_LIMITS: [number, number] = [50, 15];

export class MatryoshkaRanker {
  private readonly dims: number[];
  private readonly levelLimits: [number, number];

  constructor(
    private readonly store: EmbeddingStore,
    private readonly embedder: Embedder,
    dims?: number[],
  ) {
    this.dims = dims ?? [...DEFAULT_DIMS];
    this.levelLimits = [...DEFAULT_LEVEL_LIMITS];
  }

  /**
   * Multi-level ranked search within a single scope.
   *
   * @param scope - Search scope
   * @param query - Natural language query text
   * @param limit - Final number of results to return
   */
  async rank(scope: string, query: string, limit: number): Promise<SimilarityResult[]> {
    const queryVector = await this.embedder.embed(query);
    return this.rankWithVector(scope, queryVector, limit);
  }

  /**
   * Multi-level ranked search with a pre-computed query vector.
   * Useful when the caller already has the embedding.
   */
  rankWithVector(scope: string, queryVector: Float32Array, limit: number): SimilarityResult[] {
    // Short-circuit: if scope has few entities, skip pyramid and do full-dim scan
    const count = this.store.count(scope);
    if (count === 0) return [];
    if (count <= this.levelLimits[1]) {
      return this.store.search(scope, queryVector, this.dims[2], limit);
    }

    // Level 1: Coarse scan with lowest dims
    const level1 = this.store.search(scope, queryVector, this.dims[0], this.levelLimits[0]);
    if (level1.length === 0) return [];

    // Level 2: Re-rank level1 candidates with medium dims
    const level2 = this.rerankCandidates(scope, queryVector, level1, this.dims[1], this.levelLimits[1]);
    if (level2.length === 0) return [];

    // Level 3: Precise rank with full dims
    return this.rerankCandidates(scope, queryVector, level2, this.dims[2], limit);
  }

  /**
   * Multi-scope ranked search (for shared skills/knowledge).
   */
  async rankMultiScope(scopes: string[], query: string, limit: number): Promise<SimilarityResult[]> {
    const queryVector = await this.embedder.embed(query);
    return this.rankMultiScopeWithVector(scopes, queryVector, limit);
  }

  /**
   * Multi-scope ranked search with a pre-computed query vector.
   */
  rankMultiScopeWithVector(scopes: string[], queryVector: Float32Array, limit: number): SimilarityResult[] {
    // Count total entities across scopes
    let totalCount = 0;
    for (const scope of scopes) totalCount += this.store.count(scope);

    if (totalCount === 0) return [];

    // Short-circuit for small totals
    if (totalCount <= this.levelLimits[1]) {
      return this.store.searchMultiScope(scopes, queryVector, this.dims[2], limit);
    }

    // Level 1: Coarse scan across all scopes
    const level1 = this.store.searchMultiScope(scopes, queryVector, this.dims[0], this.levelLimits[0]);
    if (level1.length === 0) return [];

    // Level 2: Re-rank across all scopes (need to look up vectors per scope)
    const level2 = this.rerankMultiScope(scopes, queryVector, level1, this.dims[1], this.levelLimits[1]);
    if (level2.length === 0) return [];

    // Level 3: Precise rank
    return this.rerankMultiScope(scopes, queryVector, level2, this.dims[2], limit);
  }

  /**
   * Direct cosine similarity between two texts at full resolution.
   */
  async similarity(textA: string, textB: string): Promise<number> {
    const [vecA, vecB] = await this.embedder.embedBatch([textA, textB]);
    const fullDim = this.dims[this.dims.length - 1];
    return cosineSimilarity(vecA, vecB, 0, 0, fullDim);
  }

  // ---------- Private ----------

  /**
   * Re-rank a set of candidates at a higher dimension within a single scope.
   */
  private rerankCandidates(
    scope: string,
    queryVector: Float32Array,
    candidates: SimilarityResult[],
    dims: number,
    limit: number,
  ): SimilarityResult[] {
    const results: SimilarityResult[] = [];

    for (const candidate of candidates) {
      const record = this.store.get(scope, candidate.entityId);
      if (!record) continue;
      const score = cosineSimilarity(queryVector, record.vector, 0, 0, dims);
      if (score > 0) {
        results.push({ entityId: candidate.entityId, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Re-rank candidates across multiple scopes at a higher dimension.
   */
  private rerankMultiScope(
    scopes: string[],
    queryVector: Float32Array,
    candidates: SimilarityResult[],
    dims: number,
    limit: number,
  ): SimilarityResult[] {
    const candidateIds = new Set(candidates.map(c => c.entityId));
    const results: SimilarityResult[] = [];

    for (const scope of scopes) {
      const all = this.store.getAll(scope);
      for (const record of all) {
        if (!candidateIds.has(record.entityId)) continue;
        const score = cosineSimilarity(queryVector, record.vector, 0, 0, dims);
        if (score > 0) {
          // Keep max score if entity appears in multiple scopes
          const existing = results.find(r => r.entityId === record.entityId);
          if (existing) {
            existing.score = Math.max(existing.score, score);
          } else {
            results.push({ entityId: record.entityId, score });
          }
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}
