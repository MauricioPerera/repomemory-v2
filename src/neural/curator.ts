/**
 * ContextCurator — Neural Context Curation with MMR diversity.
 *
 * Decides which entities enter an LLM's context window by:
 * 1. Semantically ranking all candidates via Matryoshka pipeline
 * 2. Applying Maximal Marginal Relevance (MMR) diversity filter
 * 3. Respecting item budget constraints
 */

import type { MatryoshkaRanker } from './ranker.js';
import type { EmbeddingStore } from './store.js';
import type { Embedder } from './embedder.js';
import type { CuratedItem, SimilarityResult } from './types.js';
import { cosineSimilarity } from './store.js';

/** Minimum inter-item diversity: items more similar than this are suppressed */
const DEFAULT_DIVERSITY_THRESHOLD = 0.85;

/** Lambda balances relevance vs diversity. 0.7 = 70% relevance, 30% diversity */
const DEFAULT_LAMBDA = 0.7;

export class ContextCurator {
  private readonly diversityThreshold: number;
  private readonly lambda: number;

  constructor(
    private readonly ranker: MatryoshkaRanker,
    private readonly store: EmbeddingStore,
    private readonly embedder: Embedder,
    diversityThreshold = DEFAULT_DIVERSITY_THRESHOLD,
    lambda = DEFAULT_LAMBDA,
  ) {
    this.diversityThreshold = diversityThreshold;
    this.lambda = lambda;
  }

  /** Diversity threshold for hard-cut duplicate filtering (reserved for future use) */
  getDiversityThreshold(): number {
    return this.diversityThreshold;
  }

  /**
   * Curate a ranked, deduplicated list from pre-fetched entity candidates.
   *
   * @param query - The user query to rank against
   * @param candidates - Pre-fetched entities with content field
   * @param maxItems - Maximum items in the curated result
   * @returns Curated items sorted by neural score descending, with near-duplicates removed
   */
  async curate<T extends { id: string; content: string }>(
    query: string,
    candidates: T[],
    maxItems: number,
  ): Promise<CuratedItem<T>[]> {
    if (candidates.length === 0 || maxItems <= 0) return [];

    // Embed query and all candidates
    const queryVec = await this.embedder.embed(query);
    const fullDim = queryVec.length;

    const candidateVecs = await this.embedder.embedBatch(candidates.map(c => c.content));

    // Score each candidate against query
    const scored: Array<{ entity: T; score: number; vector: Float32Array }> = [];
    for (let i = 0; i < candidates.length; i++) {
      const score = cosineSimilarity(queryVec, candidateVecs[i], 0, 0, fullDim);
      if (score > 0) {
        scored.push({ entity: candidates[i], score, vector: candidateVecs[i] });
      }
    }

    // Sort by relevance
    scored.sort((a, b) => b.score - a.score);

    // Apply MMR diversity filter
    return this.mmrSelect(scored, maxItems, fullDim);
  }

  /**
   * Curate directly from the embedding store (no pre-fetched entities needed).
   * Returns entity IDs with scores.
   */
  async curateFromScope(
    scope: string,
    query: string,
    maxItems: number,
  ): Promise<SimilarityResult[]> {
    // Use ranker for initial retrieval (with Matryoshka pyramid)
    const topCandidates = await this.ranker.rank(scope, query, maxItems * 3);
    if (topCandidates.length <= maxItems) return topCandidates;

    // Apply diversity filter
    const queryVec = await this.embedder.embed(query);
    const fullDim = queryVec.length;

    // Retrieve vectors for candidates
    const withVectors: Array<{ entityId: string; score: number; vector: Float32Array }> = [];
    for (const c of topCandidates) {
      const record = this.store.get(scope, c.entityId);
      if (record) {
        withVectors.push({ entityId: c.entityId, score: c.score, vector: record.vector });
      }
    }

    const selected: SimilarityResult[] = [];
    const remaining = [...withVectors];

    while (selected.length < maxItems && remaining.length > 0) {
      let bestIdx = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const relevance = remaining[i].score;

        // Max similarity to any already-selected item
        let maxSim = 0;
        for (const s of selected) {
          const selVec = withVectors.find(v => v.entityId === s.entityId)?.vector;
          if (selVec) {
            const sim = cosineSimilarity(remaining[i].vector, selVec, 0, 0, fullDim);
            if (sim > maxSim) maxSim = sim;
          }
        }

        const mmrScore = this.lambda * relevance - (1 - this.lambda) * maxSim;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }

      selected.push({
        entityId: remaining[bestIdx].entityId,
        score: remaining[bestIdx].score,
      });
      remaining.splice(bestIdx, 1);
    }

    return selected;
  }

  // ---------- Private ----------

  /**
   * Maximal Marginal Relevance selection.
   * Iteratively picks items that balance relevance to query and diversity from selected set.
   */
  private mmrSelect<T>(
    scored: Array<{ entity: T; score: number; vector: Float32Array }>,
    maxItems: number,
    dims: number,
  ): CuratedItem<T>[] {
    if (scored.length === 0) return [];

    const selected: CuratedItem<T>[] = [];
    const selectedVectors: Float32Array[] = [];
    const remaining = [...scored];

    while (selected.length < maxItems && remaining.length > 0) {
      let bestIdx = 0;
      let bestMmr = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const relevance = remaining[i].score;

        // Max similarity to any already-selected item
        let maxSim = 0;
        for (const sv of selectedVectors) {
          const sim = cosineSimilarity(remaining[i].vector, sv, 0, 0, dims);
          if (sim > maxSim) maxSim = sim;
        }

        // MMR = λ × relevance - (1-λ) × maxSimilarity
        const mmr = this.lambda * relevance - (1 - this.lambda) * maxSim;
        if (mmr > bestMmr) {
          bestMmr = mmr;
          bestIdx = i;
        }
      }

      selected.push({
        entity: remaining[bestIdx].entity,
        neuralScore: remaining[bestIdx].score,
      });
      selectedVectors.push(remaining[bestIdx].vector);
      remaining.splice(bestIdx, 1);
    }

    return selected;
  }
}
