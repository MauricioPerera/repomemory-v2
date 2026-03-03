import { describe, it, expect } from 'vitest';
import { tokenize, extractTags } from '../../src/search/tokenizer.js';

describe('tokenize', () => {
  it('tokenizes text and removes stopwords', () => {
    const tokens = tokenize('The user prefers TypeScript strict mode');
    expect(tokens).toContain('user');
    expect(tokens).toContain('prefers');
    expect(tokens).toContain('typescript');
    expect(tokens).toContain('strict');
    expect(tokens).toContain('mode');
    expect(tokens).not.toContain('the');
  });

  it('handles empty input', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('removes short tokens', () => {
    const tokens = tokenize('I a am go');
    expect(tokens).not.toContain('i');
    expect(tokens).not.toContain('a');
  });

  it('handles Spanish stopwords', () => {
    const tokens = tokenize('el usuario prefiere usar TypeScript');
    expect(tokens).not.toContain('el');
    expect(tokens).toContain('usuario');
  });
});

describe('extractTags', () => {
  it('extracts top terms as tags', () => {
    const tags = extractTags('TypeScript TypeScript configuration configuration configuration testing');
    expect(tags[0]).toBe('configuration');
    expect(tags[1]).toBe('typescript');
  });
});
