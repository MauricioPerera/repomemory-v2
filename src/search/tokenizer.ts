import { stem } from './stemmer.js';

const STOPWORDS = new Set([
  // English
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'must',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his',
  'she', 'her', 'it', 'its', 'they', 'them', 'their',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
  'and', 'but', 'or', 'nor', 'not', 'so', 'if', 'then', 'than',
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'from',
  'up', 'out', 'about', 'into', 'through', 'during', 'after', 'before',
  'above', 'below', 'between', 'under', 'over',
  'no', 'yes', 'also', 'very', 'just', 'more', 'most', 'other',
  // Spanish
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'es', 'son', 'fue', 'ser', 'estar', 'ha', 'han', 'hay',
  'de', 'del', 'en', 'con', 'por', 'para', 'sin',
  'que', 'como', 'pero', 'si', 'no', 'ya', 'se',
  'yo', 'tu', 'su', 'nos', 'le', 'lo',
  'y', 'o', 'ni', 'al', 'más',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
    .map(t => stem(t));
}

export function extractTags(text: string): string[] {
  const tokens = tokenize(text);
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);
}
