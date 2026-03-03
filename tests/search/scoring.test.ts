import { describe, it, expect } from 'vitest';
import { computeScore, computeTagOverlap, daysBetween } from '../../src/search/scoring.js';

describe('computeScore', () => {
  it('returns positive score with good match', () => {
    const score = computeScore({ tfidfScore: 0.8, tagOverlap: 0.5, daysSinceUpdate: 0, accessCount: 3 });
    expect(score).toBeGreaterThan(0);
  });

  it('decays with time', () => {
    const recent = computeScore({ tfidfScore: 0.5, tagOverlap: 0, daysSinceUpdate: 0, accessCount: 0 });
    const old = computeScore({ tfidfScore: 0.5, tagOverlap: 0, daysSinceUpdate: 365, accessCount: 0 });
    expect(recent).toBeGreaterThan(old);
  });

  it('boosts with access count', () => {
    const low = computeScore({ tfidfScore: 0.5, tagOverlap: 0, daysSinceUpdate: 0, accessCount: 0 });
    const high = computeScore({ tfidfScore: 0.5, tagOverlap: 0, daysSinceUpdate: 0, accessCount: 100 });
    expect(high).toBeGreaterThan(low);
  });
});

describe('computeTagOverlap', () => {
  it('returns 1 for full overlap', () => {
    expect(computeTagOverlap(['a', 'b'], ['a', 'b'])).toBe(1);
  });

  it('returns 0 for no overlap', () => {
    expect(computeTagOverlap(['a'], ['b'])).toBe(0);
  });

  it('returns 0 for empty query tags', () => {
    expect(computeTagOverlap(['a'], [])).toBe(0);
  });
});

describe('daysBetween', () => {
  it('calculates days', () => {
    const days = daysBetween('2024-01-01', '2024-01-11');
    expect(Math.round(days)).toBe(10);
  });
});
