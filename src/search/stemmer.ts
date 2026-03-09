/**
 * Porter Stemmer — lightweight English stemmer (zero dependencies).
 * Based on the original Porter 1980 algorithm.
 * Reduces words to their root form: "running" → "run", "configurations" → "configur"
 *
 * Performance optimizations:
 * - consonant() uses O(1) lookup instead of O(N) recursion
 * - Suffix lists pre-sorted longest-first for correct greedy matching
 * - Memoization cache (10K entries) avoids re-stemming identical words
 */

const step2Map: Record<string, string> = {
  ational: 'ate', tional: 'tion', enci: 'ence', anci: 'ance',
  izer: 'ize', abli: 'able', alli: 'al', entli: 'ent',
  eli: 'e', ousli: 'ous', ization: 'ize', ation: 'ate',
  ator: 'ate', alism: 'al', iveness: 'ive', fulness: 'ful',
  ousness: 'ous', aliti: 'al', iviti: 'ive', biliti: 'ble',
};

const step3Map: Record<string, string> = {
  icate: 'ic', ative: '', alize: 'al', iciti: 'ic',
  ical: 'ic', ful: '', ness: '',
};

// Pre-sorted longest-first for greedy suffix matching
const step2Sorted = Object.entries(step2Map).sort((a, b) => b[0].length - a[0].length);
const step3Sorted = Object.entries(step3Map).sort((a, b) => b[0].length - a[0].length);
const step4Suffixes = [
  'ement', 'ance', 'ence', 'able', 'ible', 'ment', 'ism',
  'ate', 'iti', 'ous', 'ive', 'ize', 'ant', 'ent', 'ion',
  'al', 'er', 'ic', 'ou',
];

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

/** O(1) consonant check — 'y' is consonant at word start or after a vowel */
function consonant(word: string, i: number): boolean {
  if (i < 0 || i >= word.length) return false;
  const ch = word[i];
  if (VOWELS.has(ch)) return false;
  if (ch === 'y') return i === 0 || VOWELS.has(word[i - 1]);
  return true;
}

/** Count VC (vowel-consonant) sequences in the stem */
function measure(word: string): number {
  let n = 0;
  let i = 0;
  const len = word.length;
  while (i < len && consonant(word, i)) i++;
  while (i < len) {
    while (i < len && !consonant(word, i)) i++;
    if (i >= len) break;
    n++;
    while (i < len && consonant(word, i)) i++;
  }
  return n;
}

function hasVowel(word: string): boolean {
  for (let i = 0; i < word.length; i++) {
    if (!consonant(word, i)) return true;
  }
  return false;
}

function endsWithDouble(word: string): boolean {
  const len = word.length;
  if (len < 2) return false;
  return word[len - 1] === word[len - 2] && consonant(word, len - 1);
}

function cvc(word: string): boolean {
  const len = word.length;
  if (len < 3) return false;
  return consonant(word, len - 1) && !consonant(word, len - 2) && consonant(word, len - 3)
    && word[len - 1] !== 'w' && word[len - 1] !== 'x' && word[len - 1] !== 'y';
}

// Bounded memoization cache — prevents unbounded memory growth
const STEM_CACHE_MAX = 10_000;
const stemCache = new Map<string, string>();

export function stem(word: string): string {
  if (word.length < 3) return word;

  const cached = stemCache.get(word);
  if (cached !== undefined) return cached;

  let w = word.toLowerCase();

  // Step 1a
  if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.endsWith('ies')) w = w.slice(0, -2);
  else if (!w.endsWith('ss') && w.endsWith('s')) w = w.slice(0, -1);

  // Step 1b
  let step1bFlag = false;
  if (w.endsWith('eed')) {
    if (measure(w.slice(0, -3)) > 0) w = w.slice(0, -1);
  } else if (w.endsWith('ed') && hasVowel(w.slice(0, -2))) {
    w = w.slice(0, -2);
    step1bFlag = true;
  } else if (w.endsWith('ing') && hasVowel(w.slice(0, -3))) {
    w = w.slice(0, -3);
    step1bFlag = true;
  }

  if (step1bFlag) {
    if (w.endsWith('at') || w.endsWith('bl') || w.endsWith('iz')) {
      w += 'e';
    } else if (endsWithDouble(w) && !w.endsWith('l') && !w.endsWith('s') && !w.endsWith('z')) {
      w = w.slice(0, -1);
    } else if (measure(w) === 1 && cvc(w)) {
      w += 'e';
    }
  }

  // Step 1c
  if (w.endsWith('y') && hasVowel(w.slice(0, -1))) {
    w = w.slice(0, -1) + 'i';
  }

  // Step 2 (sorted longest-suffix-first for greedy matching)
  for (const [suffix, replacement] of step2Sorted) {
    if (w.endsWith(suffix)) {
      const s = w.slice(0, -suffix.length);
      if (measure(s) > 0) w = s + replacement;
      break;
    }
  }

  // Step 3 (sorted longest-suffix-first)
  for (const [suffix, replacement] of step3Sorted) {
    if (w.endsWith(suffix)) {
      const s = w.slice(0, -suffix.length);
      if (measure(s) > 0) w = s + replacement;
      break;
    }
  }

  // Step 4 (sorted longest-suffix-first)
  for (const suffix of step4Suffixes) {
    if (w.endsWith(suffix)) {
      const s = w.slice(0, -suffix.length);
      if (suffix === 'ion') {
        if (measure(s) > 1 && (s.endsWith('s') || s.endsWith('t'))) w = s;
      } else if (measure(s) > 1) {
        w = s;
      }
      break;
    }
  }

  // Step 5a
  if (w.endsWith('e')) {
    const s = w.slice(0, -1);
    if (measure(s) > 1 || (measure(s) === 1 && !cvc(s))) w = s;
  }

  // Step 5b
  if (measure(w) > 1 && endsWithDouble(w) && w.endsWith('l')) {
    w = w.slice(0, -1);
  }

  // Cache result (evict oldest if full)
  if (stemCache.size >= STEM_CACHE_MAX) {
    const firstKey = stemCache.keys().next().value;
    if (firstKey !== undefined) stemCache.delete(firstKey);
  }
  stemCache.set(word, w);

  return w;
}
