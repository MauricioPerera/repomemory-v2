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
  const decay = w.decayRate === 0 ? 1 : Math.exp(-w.decayRate * daysSinceUpdate);
  const rawBoost = 1 + Math.log2(1 + accessCount);
  const accessBoost = Math.min(rawBoost, w.maxAccessBoost);
  return relevance * decay * accessBoost;
}

export function computeTagOverlap(entityTags: string[], queryTags: string[]): number {
  if (queryTags.length === 0 || entityTags.length === 0) return 0;
  // Normalize both sides to lowercase for case-insensitive matching.
  // Exact matches are checked first; if a tag didn't match exactly,
  // we don't stem here because tags are short labels that should match as-is.
  const querySet = new Set(queryTags.map(t => t.toLowerCase()));
  const normalized = entityTags.map(t => t.toLowerCase());
  const matches = normalized.filter(t => querySet.has(t)).length;
  const union = new Set([...normalized, ...queryTags.map(t => t.toLowerCase())]).size;
  return matches / union;
}

export function daysBetween(a: string | Date, b: string | Date): number {
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  const diff = Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24);
  return Number.isNaN(diff) ? 0 : diff;
}
