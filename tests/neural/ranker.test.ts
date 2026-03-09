import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EmbeddingStore } from '../../src/neural/store.js';
import { MatryoshkaRanker } from '../../src/neural/ranker.js';

/** Create a deterministic normalized Float32Array vector */
function makeVector(dim: number, seed: number): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    v[i] = Math.sin(seed * (i + 1) * 0.1);
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}

/** Mock embedder that generates vectors deterministically from text */
function createMockEmbedder() {
  const seedMap = new Map<string, number>();
  let nextSeed = 100;

  return {
    embed: vi.fn().mockImplementation(async (text: string) => {
      if (!seedMap.has(text)) seedMap.set(text, nextSeed++);
      return makeVector(768, seedMap.get(text)!);
    }),
    embedBatch: vi.fn().mockImplementation(async (texts: string[]) => {
      const results: Float32Array[] = [];
      for (const text of texts) {
        if (!seedMap.has(text)) seedMap.set(text, nextSeed++);
        results.push(makeVector(768, seedMap.get(text)!));
      }
      return results;
    }),
    isLoaded: true,
    model: 'mock-model',
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    embedMultiRes: vi.fn(),
    _setSeed: (text: string, seed: number) => seedMap.set(text, seed),
  };
}

describe('MatryoshkaRanker', () => {
  let dir: string;
  let store: EmbeddingStore;
  let mockEmbedder: ReturnType<typeof createMockEmbedder>;
  let ranker: MatryoshkaRanker;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'neural-ranker-test-'));
    store = new EmbeddingStore(dir);
    store.init();
    mockEmbedder = createMockEmbedder();
    ranker = new MatryoshkaRanker(store, mockEmbedder as never);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  describe('rank', () => {
    it('returns empty for empty scope', async () => {
      const results = await ranker.rank('empty', 'query', 10);
      expect(results).toEqual([]);
    });

    it('finds exact match as top result', async () => {
      // Pre-set the query seed so we know the vector
      const queryVec = makeVector(768, 42);
      mockEmbedder._setSeed('find me', 42);

      // Store the exact same vector
      store.set('scope1', 'exact-match', queryVec);
      // Store some others
      store.set('scope1', 'other-1', makeVector(768, 1));
      store.set('scope1', 'other-2', makeVector(768, 2));

      const results = await ranker.rank('scope1', 'find me', 3);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entityId).toBe('exact-match');
      expect(results[0].score).toBeCloseTo(1.0, 3);
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 20; i++) {
        store.set('scope1', `e-${i}`, makeVector(768, i));
      }

      const results = await ranker.rank('scope1', 'query', 5);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('short-circuits to full-dim for small scopes', async () => {
      // With <= 15 entities, ranker should skip pyramid and do full-dim scan
      store.set('scope1', 'a', makeVector(768, 1));
      store.set('scope1', 'b', makeVector(768, 2));

      const results = await ranker.rank('scope1', 'query', 5);
      expect(results.length).toBe(2);
    });

    it('uses pyramid for large scopes', async () => {
      // With > 15 entities, pyramid should engage
      for (let i = 0; i < 30; i++) {
        store.set('scope1', `e-${i}`, makeVector(768, i));
      }

      const results = await ranker.rank('scope1', 'query', 5);
      expect(results.length).toBeLessThanOrEqual(5);
      // Results should be sorted by score descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
      }
    });
  });

  describe('rankMultiScope', () => {
    it('merges results across scopes', async () => {
      store.set('scope-a', 'e1', makeVector(768, 1));
      store.set('scope-b', 'e2', makeVector(768, 2));

      const results = await ranker.rankMultiScope(['scope-a', 'scope-b'], 'query', 10);
      expect(results.length).toBe(2);
    });

    it('returns empty for empty scopes', async () => {
      const results = await ranker.rankMultiScope(['empty-1', 'empty-2'], 'query', 10);
      expect(results).toEqual([]);
    });
  });

  describe('similarity', () => {
    it('returns high similarity for same text', async () => {
      const score = await ranker.similarity('hello world', 'hello world');
      expect(score).toBeCloseTo(1.0, 3);
    });

    it('returns lower similarity for different texts', async () => {
      const score = await ranker.similarity('text A', 'text B');
      expect(score).toBeLessThan(1.0);
    });
  });
});
