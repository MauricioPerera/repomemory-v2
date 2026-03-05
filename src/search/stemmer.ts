/**
 * Porter Stemmer — lightweight English stemmer (zero dependencies).
 * Based on the original Porter 1980 algorithm.
 * Reduces words to their root form: "running" → "run", "configurations" → "configur"
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

function consonant(word: string, i: number): boolean {
  const ch = word[i];
  if (ch === 'a' || ch === 'e' || ch === 'i' || ch === 'o' || ch === 'u') return false;
  if (ch === 'y') return i === 0 || !consonant(word, i - 1);
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

export function stem(word: string): string {
  if (word.length < 3) return word;
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

  // Step 2
  for (const [suffix, replacement] of Object.entries(step2Map)) {
    if (w.endsWith(suffix)) {
      const stem = w.slice(0, -suffix.length);
      if (measure(stem) > 0) w = stem + replacement;
      break;
    }
  }

  // Step 3
  for (const [suffix, replacement] of Object.entries(step3Map)) {
    if (w.endsWith(suffix)) {
      const stem = w.slice(0, -suffix.length);
      if (measure(stem) > 0) w = stem + replacement;
      break;
    }
  }

  // Step 4
  const step4Suffixes = [
    'al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant',
    'ement', 'ment', 'ent', 'ion', 'ou', 'ism', 'ate', 'iti',
    'ous', 'ive', 'ize',
  ];
  for (const suffix of step4Suffixes) {
    if (w.endsWith(suffix)) {
      const stem = w.slice(0, -suffix.length);
      if (suffix === 'ion') {
        if (measure(stem) > 1 && (stem.endsWith('s') || stem.endsWith('t'))) {
          w = stem;
        }
      } else if (measure(stem) > 1) {
        w = stem;
      }
      break;
    }
  }

  // Step 5a
  if (w.endsWith('e')) {
    const stem = w.slice(0, -1);
    if (measure(stem) > 1 || (measure(stem) === 1 && !cvc(stem))) {
      w = stem;
    }
  }

  // Step 5b
  if (measure(w) > 1 && endsWithDouble(w) && w.endsWith('l')) {
    w = w.slice(0, -1);
  }

  return w;
}
