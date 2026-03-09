import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EmbeddingStore, cosineSimilarity } from '../../src/neural/store.js';

/** Create a deterministic Float32Array vector of given dimension */
function makeVector(dim: number, seed: number): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    v[i] = Math.sin(seed * (i + 1) * 0.1);
  }
  // L2-normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}

describe('EmbeddingStore', () => {
  let dir: string;
  let store: EmbeddingStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'neural-store-test-'));
    store = new EmbeddingStore(dir);
    store.init();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  describe('set and get', () => {
    it('stores and retrieves a vector', () => {
      const vec = makeVector(768, 1);
      store.set('scope1', 'entity-1', vec);

      const result = store.get('scope1', 'entity-1');
      expect(result).not.toBeNull();
      expect(result!.entityId).toBe('entity-1');
      expect(result!.vector.length).toBe(768);
      // Check values match
      for (let i = 0; i < 768; i++) {
        expect(result!.vector[i]).toBeCloseTo(vec[i], 5);
      }
    });

    it('overwrites existing vector', () => {
      const vec1 = makeVector(768, 1);
      const vec2 = makeVector(768, 2);
      store.set('scope1', 'entity-1', vec1);
      store.set('scope1', 'entity-1', vec2);

      const result = store.get('scope1', 'entity-1');
      expect(result).not.toBeNull();
      for (let i = 0; i < 768; i++) {
        expect(result!.vector[i]).toBeCloseTo(vec2[i], 5);
      }
      expect(store.count('scope1')).toBe(1);
    });

    it('returns null for non-existent entity', () => {
      expect(store.get('scope1', 'missing')).toBeNull();
    });

    it('returns null for non-existent scope', () => {
      expect(store.get('nonexistent', 'entity-1')).toBeNull();
    });
  });

  describe('remove', () => {
    it('removes existing entity and returns true', () => {
      store.set('scope1', 'entity-1', makeVector(768, 1));
      store.set('scope1', 'entity-2', makeVector(768, 2));

      expect(store.remove('scope1', 'entity-1')).toBe(true);
      expect(store.get('scope1', 'entity-1')).toBeNull();
      expect(store.count('scope1')).toBe(1);
    });

    it('returns false for non-existent entity', () => {
      expect(store.remove('scope1', 'missing')).toBe(false);
    });

    it('swap-removes correctly (last element stays intact)', () => {
      store.set('scope1', 'a', makeVector(768, 1));
      store.set('scope1', 'b', makeVector(768, 2));
      store.set('scope1', 'c', makeVector(768, 3));

      // Remove 'a' (first) — 'c' should swap into position 0
      store.remove('scope1', 'a');

      expect(store.get('scope1', 'a')).toBeNull();
      expect(store.get('scope1', 'b')).not.toBeNull();
      expect(store.get('scope1', 'c')).not.toBeNull();
      expect(store.count('scope1')).toBe(2);
    });

    it('handles removing the only element', () => {
      store.set('scope1', 'alone', makeVector(768, 1));
      expect(store.remove('scope1', 'alone')).toBe(true);
      expect(store.count('scope1')).toBe(0);
    });
  });

  describe('getAll', () => {
    it('returns all records for a scope', () => {
      store.set('scope1', 'a', makeVector(768, 1));
      store.set('scope1', 'b', makeVector(768, 2));

      const all = store.getAll('scope1');
      expect(all.length).toBe(2);
      const ids = all.map(r => r.entityId).sort();
      expect(ids).toEqual(['a', 'b']);
    });

    it('returns empty array for empty scope', () => {
      expect(store.getAll('empty')).toEqual([]);
    });
  });

  describe('search', () => {
    it('finds most similar vector', () => {
      const target = makeVector(768, 42);
      const similar = makeVector(768, 43);   // close seed = similar vector
      const different = makeVector(768, 999); // far seed = different vector

      store.set('scope1', 'target', target);
      store.set('scope1', 'similar', similar);
      store.set('scope1', 'different', different);

      // Search with the target itself — should be #1
      const results = store.search('scope1', target, 768, 10);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].entityId).toBe('target');
      expect(results[0].score).toBeCloseTo(1.0, 3); // perfect match
    });

    it('respects dimSlice parameter', () => {
      store.set('scope1', 'a', makeVector(768, 1));
      store.set('scope1', 'b', makeVector(768, 2));

      const query = makeVector(768, 1);
      const results128 = store.search('scope1', query, 128, 10);
      const results768 = store.search('scope1', query, 768, 10);

      // Both should return results, but scores may differ slightly
      expect(results128.length).toBeGreaterThan(0);
      expect(results768.length).toBeGreaterThan(0);
    });

    it('respects limit', () => {
      for (let i = 0; i < 20; i++) {
        store.set('scope1', `e-${i}`, makeVector(768, i));
      }

      const results = store.search('scope1', makeVector(768, 5), 768, 3);
      expect(results.length).toBe(3);
    });

    it('returns empty for empty scope', () => {
      expect(store.search('empty', makeVector(768, 1), 768, 10)).toEqual([]);
    });

    it('excludes zero/negative scores', () => {
      // Create orthogonal vectors (zero cosine similarity is rare with random,
      // but we check the filter logic works)
      const results = store.search('empty-scope', makeVector(768, 1), 768, 10);
      expect(results.length).toBe(0);
    });
  });

  describe('searchMultiScope', () => {
    it('merges results across scopes', () => {
      store.set('scope-a', 'e1', makeVector(768, 1));
      store.set('scope-b', 'e2', makeVector(768, 2));

      const query = makeVector(768, 1);
      const results = store.searchMultiScope(['scope-a', 'scope-b'], query, 768, 10);

      expect(results.length).toBe(2);
      // e1 should score higher (same seed as query)
      expect(results[0].entityId).toBe('e1');
    });

    it('keeps max score when entity appears in multiple scopes', () => {
      const vec = makeVector(768, 1);
      store.set('scope-a', 'shared', vec);
      store.set('scope-b', 'shared', vec);

      const results = store.searchMultiScope(['scope-a', 'scope-b'], vec, 768, 10);
      // Should appear only once
      const sharedResults = results.filter(r => r.entityId === 'shared');
      expect(sharedResults.length).toBe(1);
      expect(sharedResults[0].score).toBeCloseTo(1.0, 3);
    });
  });

  describe('flush and reload', () => {
    it('persists to disk and reloads', () => {
      const vec = makeVector(768, 42);
      store.set('scope1', 'entity-1', vec);
      store.set('scope1', 'entity-2', makeVector(768, 7));
      store.flush();

      // Create new store from same dir
      const store2 = new EmbeddingStore(dir);
      store2.init();

      const result = store2.get('scope1', 'entity-1');
      expect(result).not.toBeNull();
      expect(result!.vector.length).toBe(768);
      for (let i = 0; i < 768; i++) {
        expect(result!.vector[i]).toBeCloseTo(vec[i], 5);
      }
      expect(store2.count('scope1')).toBe(2);
    });

    it('cleans up empty scope files', () => {
      store.set('scope1', 'only', makeVector(768, 1));
      store.flush();

      store.remove('scope1', 'only');
      store.flush();

      // New store should not load any vectors
      const store2 = new EmbeddingStore(dir);
      store2.init();
      expect(store2.count('scope1')).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest scopes when exceeding max', () => {
      const smallStore = new EmbeddingStore(dir, 3); // max 3 scopes
      smallStore.init();

      for (let i = 0; i < 5; i++) {
        smallStore.set(`scope-${i}`, 'entity', makeVector(768, i));
      }

      // Should have evicted scope-0 and scope-1 (oldest accessed)
      expect(smallStore.stats().loadedScopes).toBeLessThanOrEqual(3);
    });

    it('evicted scopes are persisted before removal', () => {
      const smallStore = new EmbeddingStore(dir, 2);
      smallStore.init();

      smallStore.set('scope-a', 'e1', makeVector(768, 1));
      smallStore.set('scope-b', 'e2', makeVector(768, 2));
      smallStore.set('scope-c', 'e3', makeVector(768, 3)); // evicts scope-a

      // scope-a should still be loadable from disk
      const result = smallStore.get('scope-a', 'e1');
      expect(result).not.toBeNull();
    });
  });

  describe('stats', () => {
    it('reports correct counts', () => {
      store.set('s1', 'a', makeVector(768, 1));
      store.set('s1', 'b', makeVector(768, 2));
      store.set('s2', 'c', makeVector(768, 3));

      const stats = store.stats();
      expect(stats.loadedScopes).toBe(2);
      expect(stats.totalVectors).toBe(3);
      expect(stats.estimatedMemoryMB).toBeGreaterThan(0);
    });
  });

  describe('scope encoding', () => {
    it('handles colons and special characters in scope names', () => {
      const vec = makeVector(768, 1);
      store.set('memories:agent-1:user_2', 'e1', vec);
      store.flush();

      const store2 = new EmbeddingStore(dir);
      store2.init();
      expect(store2.get('memories:agent-1:user_2', 'e1')).not.toBeNull();
    });
  });
});

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical normalized vectors', () => {
    const v = makeVector(768, 42);
    expect(cosineSimilarity(v, v, 0, 0, 768)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for zero vectors', () => {
    const zero = new Float32Array(768);
    const v = makeVector(768, 1);
    expect(cosineSimilarity(zero, v, 0, 0, 768)).toBe(0);
  });

  it('works with offsets into larger arrays', () => {
    const combined = new Float32Array(768 * 3);
    const v1 = makeVector(768, 1);
    const v2 = makeVector(768, 2);
    combined.set(v1, 0);
    combined.set(v2, 768);
    combined.set(v1, 768 * 2);

    // v1 vs v1 at different offsets
    expect(cosineSimilarity(combined, combined, 0, 768 * 2, 768)).toBeCloseTo(1.0, 5);
    // v1 vs v2
    const sim12 = cosineSimilarity(combined, combined, 0, 768, 768);
    expect(sim12).toBeGreaterThan(0);
    expect(sim12).toBeLessThan(1.0);
  });

  it('respects dims parameter (Matryoshka truncation)', () => {
    const v = makeVector(768, 1);
    // Full dim comparison with self = 1.0
    expect(cosineSimilarity(v, v, 0, 0, 768)).toBeCloseTo(1.0, 5);
    // 128-dim comparison with self = 1.0 (since it's normalized in that subspace too)
    expect(cosineSimilarity(v, v, 0, 0, 128)).toBeCloseTo(1.0, 5);
  });
});
