export interface ScoringParams {
  tfidfScore: number;
  tagOverlap: number;
  daysSinceUpdate: number;
  accessCount: number;
}

export function computeScore(params: ScoringParams): number {
  const { tfidfScore, tagOverlap, daysSinceUpdate, accessCount } = params;
  const relevance = tfidfScore * 0.7 + tagOverlap * 0.3;
  const decay = Math.exp(-0.005 * daysSinceUpdate);
  const accessBoost = 1 + Math.log2(1 + accessCount);
  return relevance * decay * accessBoost;
}

export function computeTagOverlap(entityTags: string[], queryTags: string[]): number {
  if (queryTags.length === 0 || entityTags.length === 0) return 0;
  const querySet = new Set(queryTags);
  const matches = entityTags.filter(t => querySet.has(t)).length;
  const union = new Set([...entityTags, ...queryTags]).size;
  return matches / union;
}

export function daysBetween(a: string | Date, b: string | Date): number {
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  return Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24);
}
