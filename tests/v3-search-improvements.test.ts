import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';
import { stem } from '../src/search/stemmer.js';
import { tokenize } from '../src/search/tokenizer.js';
import { computeScore, DEFAULT_SCORING_WEIGHTS } from '../src/search/scoring.js';
import { expandQuery } from '../src/search/query-expander.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'repomemory-v3-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// =============================================================================
// Porter Stemmer
// =============================================================================

describe('Porter Stemmer', () => {
  it('stems common English suffixes', () => {
    expect(stem('running')).toBe('run');
    expect(stem('configurations')).toBe('configur');
    expect(stem('connected')).toBe('connect');
    expect(stem('connections')).toBe('connect');
    expect(stem('connecting')).toBe('connect');
  });

  it('preserves short words', () => {
    expect(stem('go')).toBe('go');
    expect(stem('an')).toBe('an');
  });

  it('handles -sses, -ies, -s', () => {
    expect(stem('caresses')).toBe('caress');
    expect(stem('ponies')).toBe('poni');
    expect(stem('cats')).toBe('cat');
    expect(stem('grass')).toBe('grass'); // -ss stays
  });

  it('handles -ational, -izer, etc (step 2)', () => {
    expect(stem('relational')).toBe('relat');
    expect(stem('digitizer')).toBe('digit');
  });

  it('handles -icate, -ful, -ness (step 3)', () => {
    expect(stem('triplicate')).toBe('triplic');
    expect(stem('hopeful')).toBe('hope');
    expect(stem('goodness')).toBe('good');
  });
});

describe('Tokenizer with stemming', () => {
  it('stems tokens during tokenization', () => {
    const tokens = tokenize('The users were running configurations');
    // "The" and "were" are stopwords
    expect(tokens).toContain('user'); // "users" → "user"
    expect(tokens).toContain('run');  // "running" → "run"
    expect(tokens).toContain('configur'); // "configurations" → "configur"
  });

  it('stemming enables matching different word forms', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    repo.memories.save('a1', 'u1', {
      content: 'The database connections are failing intermittently',
      tags: ['database', 'connection'],
      category: 'issue',
    });
    repo.memories.save('a1', 'u1', {
      content: 'We decided to use TypeScript for all new projects',
      tags: ['typescript', 'decision'],
      category: 'decision',
    });

    // "connecting" should match "connections" via stemming
    const results = repo.memories.search('a1', 'u1', 'database connecting', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entity.content).toContain('database connections');
  });
});

// =============================================================================
// Configurable Scoring Weights
// =============================================================================

describe('Configurable scoring weights', () => {
  it('exports default weights', () => {
    expect(DEFAULT_SCORING_WEIGHTS.tfidfWeight).toBe(0.7);
    expect(DEFAULT_SCORING_WEIGHTS.tagWeight).toBe(0.3);
    expect(DEFAULT_SCORING_WEIGHTS.decayRate).toBe(0.005);
    expect(DEFAULT_SCORING_WEIGHTS.maxAccessBoost).toBe(5.0);
  });

  it('uses custom weights when provided', () => {
    const defaultScore = computeScore({
      tfidfScore: 1.0,
      tagOverlap: 1.0,
      daysSinceUpdate: 0,
      accessCount: 0,
    });

    // Flip weights: tags are now dominant
    const customScore = computeScore({
      tfidfScore: 1.0,
      tagOverlap: 1.0,
      daysSinceUpdate: 0,
      accessCount: 0,
      weights: { tfidfWeight: 0.3, tagWeight: 0.7 },
    });

    // Both should equal 1.0 when tfidf=1 and tagOverlap=1
    expect(defaultScore).toBe(customScore);

    // Now test with different tfidf and tag values
    const scoreA = computeScore({
      tfidfScore: 0.5,
      tagOverlap: 0.1,
      daysSinceUpdate: 0,
      accessCount: 0,
      weights: { tfidfWeight: 0.9, tagWeight: 0.1 },
    });
    const scoreB = computeScore({
      tfidfScore: 0.5,
      tagOverlap: 0.1,
      daysSinceUpdate: 0,
      accessCount: 0,
      weights: { tfidfWeight: 0.1, tagWeight: 0.9 },
    });
    // When tagOverlap is low, tfidf-heavy weights should produce higher score
    expect(scoreA).toBeGreaterThan(scoreB);
  });

  it('decayRate=0 means no decay', () => {
    const score = computeScore({
      tfidfScore: 1.0,
      tagOverlap: 0,
      daysSinceUpdate: 365, // 1 year old
      accessCount: 0,
      weights: { decayRate: 0 },
    });
    // With no decay, score = 0.7 * 1.0 * 1.0 (decay) * 1.0 (access)
    expect(score).toBeCloseTo(0.7, 5);
  });

  it('accepts scoring config in RepoMemory constructor', () => {
    const repo = new RepoMemory({
      dir: tmpDir,
      scoring: { decayRate: 0, maxAccessBoost: 2.0 },
    });
    // Just verify it doesn't throw — weights are wired internally
    repo.memories.save('a1', 'u1', {
      content: 'Test memory with custom scoring',
      tags: ['test'],
      category: 'fact',
    });
    const results = repo.memories.search('a1', 'u1', 'custom scoring', 5);
    expect(results.length).toBe(1);
  });
});

// =============================================================================
// Access Boost Cap
// =============================================================================

describe('Access boost cap', () => {
  it('caps access boost at maxAccessBoost', () => {
    // Without cap: accessBoost for 1000 accesses = 1 + log2(1001) ≈ 10.97
    const uncapped = computeScore({
      tfidfScore: 1.0,
      tagOverlap: 0,
      daysSinceUpdate: 0,
      accessCount: 1000,
      weights: { maxAccessBoost: 100 }, // effectively uncapped
    });

    const capped = computeScore({
      tfidfScore: 1.0,
      tagOverlap: 0,
      daysSinceUpdate: 0,
      accessCount: 1000,
      weights: { maxAccessBoost: 3.0 },
    });

    expect(uncapped).toBeGreaterThan(capped);
    // Capped should be exactly: 0.7 * 1.0 * 3.0 = 2.1
    expect(capped).toBeCloseTo(0.7 * 3.0, 5);
  });

  it('default cap is 5.0', () => {
    const score = computeScore({
      tfidfScore: 1.0,
      tagOverlap: 0,
      daysSinceUpdate: 0,
      accessCount: 100000, // extremely high
    });
    // Should be capped: 0.7 * 1.0 * 5.0 = 3.5
    expect(score).toBeCloseTo(0.7 * 5.0, 5);
  });
});

// =============================================================================
// Query Expansion
// =============================================================================

describe('Query expansion', () => {
  it('expands abbreviations to full terms', () => {
    const expanded = expandQuery('ts config');
    expect(expanded).toContain('typescript');
    expect(expanded).toContain('configuration');
    expect(expanded).toContain('settings');
    expect(expanded).toContain('ts'); // original preserved
    expect(expanded).toContain('config'); // original preserved
  });

  it('expands full terms to abbreviations (reverse)', () => {
    const expanded = expandQuery('typescript configuration');
    expect(expanded).toContain('ts');
    expect(expanded).toContain('config');
  });

  it('preserves unknown tokens unchanged', () => {
    const expanded = expandQuery('foobar bazqux');
    expect(expanded).toBe('foobar bazqux');
  });

  it('improves search recall with abbreviations', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    repo.memories.save('a1', 'u1', {
      content: 'TypeScript configuration for strict mode in tsconfig.json',
      tags: ['typescript', 'configuration'],
      category: 'fact',
    });

    // Search with abbreviation "ts config" — should find it via expansion
    const results = repo.memories.search('a1', 'u1', 'ts config', 5);
    expect(results.length).toBe(1);
    expect(results[0].entity.content).toContain('TypeScript');
  });

  it('handles database abbreviations', () => {
    const expanded = expandQuery('pg optimization');
    expect(expanded).toContain('postgres');
    expect(expanded).toContain('postgresql');
  });

  it('handles devops abbreviations', () => {
    const expanded = expandQuery('k8s deployment');
    expect(expanded).toContain('kubernetes');
  });
});

// =============================================================================
// Smart Recall Budget
// =============================================================================

describe('Smart recall budget allocation', () => {
  it('allocates budget by score, not equal split', () => {
    const repo = new RepoMemory({ dir: tmpDir });

    // Save 5 highly relevant memories about deployment
    for (let i = 0; i < 5; i++) {
      repo.memories.save('a1', 'u1', {
        content: `Deployment procedure step ${i + 1}: configure the pipeline`,
        tags: ['deployment', 'pipeline'],
        category: 'fact',
      });
    }

    // Save 1 barely relevant skill
    repo.skills.save('a1', undefined, {
      content: 'How to format code using prettier',
      tags: ['formatting', 'prettier'],
      category: 'procedure',
    });

    // Save 1 barely relevant knowledge
    repo.knowledge.save('a1', undefined, {
      content: 'Company holiday schedule for 2025',
      tags: ['schedule'],
    });

    // Recall with maxItems=5 — should get mostly memories since they match best
    const ctx = repo.recall('a1', 'u1', 'deployment pipeline', { maxItems: 5 });
    expect(ctx.memories.length).toBeGreaterThanOrEqual(3);
    expect(ctx.totalItems).toBeLessThanOrEqual(5);
  });
});

// =============================================================================
// Index Stats
// =============================================================================

describe('Index stats in stats()', () => {
  it('returns index diagnostic information', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    repo.memories.save('a1', 'u1', {
      content: 'First memory for testing',
      tags: ['test'],
      category: 'fact',
    });
    repo.skills.save('a1', undefined, {
      content: 'How to run tests',
      tags: ['testing'],
      category: 'procedure',
    });

    const stats = repo.stats();
    expect(stats.index).toBeDefined();
    expect(stats.index.scopes).toBeGreaterThanOrEqual(2);
    expect(stats.index.totalDocuments).toBeGreaterThanOrEqual(2);
    expect(stats.index.scopeDetails.length).toBeGreaterThanOrEqual(2);
  });
});
