export interface ScoringWeights {
  /** Weight for TF-IDF score (default 0.7) */
  tfidfWeight?: number;
  /** Weight for tag overlap (default 0.3) */
  tagWeight?: number;
  /** Decay rate per day (default 0.005). Higher = faster decay. 0 = no decay. */
  decayRate?: number;
  /** Maximum access boost multiplier (default 5.0). Prevents runaway popularity. */
  maxAccessBoost?: number;
}

export const DEFAULT_SCORING_WEIGHTS: Required<ScoringWeights> = {
  tfidfWeight: 0.7,
  tagWeight: 0.3,
  decayRate: 0.005,
  maxAccessBoost: 5.0,
};

export interface ScoringParams {
  tfidfScore: number;
  tagOverlap: number;
  daysSinceUpdate: number;
  accessCount: number;
  weights?: ScoringWeights;
}

export function computeScore(params: ScoringParams): number {
  const { tfidfScore, tagOverlap, daysSinceUpdate, accessCount, weights } = params;
  const w = { ...DEFAULT_SCORING_WEIGHTS, ...weights };
  const relevance = tfidfScore * w.tfidfWeight + tagOverlap * w.tagWeight;
  // Clamp decay to prevent underflow for very old entities (floor at 1% relevance)
  const decay = w.decayRate === 0 ? 1 : Math.max(0.01, Math.exp(-w.decayRate * daysSinceUpdate));
  // Fix: log2(2 + count) ensures first access (count=1) already provides a boost
  // count=0 → 1.0, count=1 → 1.58, count=10 → 3.58, capped at maxAccessBoost
  const rawBoost = Math.log2(2 + accessCount);
  const accessBoost = Math.min(rawBoost, w.maxAccessBoost);
  return relevance * decay * accessBoost;
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
