export interface ScoringWeights {
  /** Weight for TF-IDF score (default 0.7) */
  tfidfWeight?: number;
  /** Weight for tag overlap (default 0.3) */
  tagWeight?: number;
  /** Weight for neural embedding similarity (default 0). Set to 0.4 when neural is active. */
  embeddingWeight?: number;
  /** Decay rate per day (default 0.005). Higher = faster decay. 0 = no decay. */
  decayRate?: number;
  /** Maximum access boost multiplier (default 5.0). Prevents runaway popularity. */
  maxAccessBoost?: number;
  /** Multiplier applied to correction entities (default 2.0). Ensures corrections surface above conflicting memories. */
  correctionBoost?: number;
}

export const DEFAULT_SCORING_WEIGHTS: Required<ScoringWeights> = {
  tfidfWeight: 0.7,
  tagWeight: 0.3,
  embeddingWeight: 0,
  decayRate: 0.005,
  maxAccessBoost: 5.0,
  correctionBoost: 2.0,
};

export interface ScoringParams {
  tfidfScore: number;
  tagOverlap: number;
  daysSinceUpdate: number;
  accessCount: number;
  weights?: ScoringWeights;
  /** Neural embedding cosine similarity (0..1). Optional — when absent, formula is identical to pre-neural behavior. */
  embeddingScore?: number;
  /** When true, applies correctionBoost multiplier to the final score. */
  isCorrection?: boolean;
}

export function computeScore(params: ScoringParams): number {
  const { tfidfScore, tagOverlap, daysSinceUpdate, accessCount, weights, embeddingScore, isCorrection } = params;
  const w = { ...DEFAULT_SCORING_WEIGHTS, ...weights };

  // When embedding score is available and has weight, include it in relevance
  const embWeight = embeddingScore != null ? w.embeddingWeight : 0;
  const totalWeight = w.tfidfWeight + w.tagWeight + embWeight;
  // Normalize weights to sum to 1.0 (preserves backward compat when embWeight=0)
  const normTfidf = totalWeight > 0 ? w.tfidfWeight / totalWeight : 0;
  const normTag = totalWeight > 0 ? w.tagWeight / totalWeight : 0;
  const normEmb = totalWeight > 0 ? embWeight / totalWeight : 0;
  const relevance = tfidfScore * normTfidf + tagOverlap * normTag + (embeddingScore ?? 0) * normEmb;
  // Clamp decay to prevent underflow for very old entities (floor at 1% relevance)
  const decay = w.decayRate === 0 ? 1 : Math.max(0.01, Math.exp(-w.decayRate * daysSinceUpdate));
  // Fix: log2(2 + count) ensures first access (count=1) already provides a boost
  // count=0 → 1.0, count=1 → 1.58, count=10 → 3.58, capped at maxAccessBoost
  const rawBoost = Math.log2(2 + accessCount);
  const accessBoost = Math.min(rawBoost, w.maxAccessBoost);
  const base = relevance * decay * accessBoost;
  return isCorrection ? base * w.correctionBoost : base;
}

/**
 * Jaccard similarity between entity tags and query tags.
 * Normalizes to lowercase and applies stemming for consistency with TF-IDF pipeline.
 * This ensures 'running' matches 'run', 'configurations' matches 'configuration', etc.
 */
export function computeTagOverlap(entityTags: string[], queryTags: string[], stemFn?: (w: string) => string): number {
  if (queryTags.length === 0 || entityTags.length === 0) return 0;
  const normalize = stemFn
    ? (t: string) => stemFn(t.toLowerCase())
    : (t: string) => t.toLowerCase();
  const querySet = new Set(queryTags.map(normalize));
  const normalized = entityTags.map(normalize);
  const matches = normalized.filter(t => querySet.has(t)).length;
  const union = new Set([...normalized, ...querySet]).size;
  return matches / union;
}

export function daysBetween(a: string | Date, b: string | Date): number {
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  const diff = Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24);
  return Number.isNaN(diff) ? 0 : diff;
}
