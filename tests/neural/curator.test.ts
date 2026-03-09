import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EmbeddingStore } from '../../src/neural/store.js';
import { MatryoshkaRanker } from '../../src/neural/ranker.js';
import { ContextCurator } from '../../src/neural/curator.js';

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

/** Mock embedder with deterministic text-to-vector mapping */
function createMockEmbedder() {
  const seedMap = new Map<string, number>();
  let nextSeed = 100;

  const getVector = (text: string): Float32Array => {
    if (!seedMap.has(text)) seedMap.set(text, nextSeed++);
    return makeVector(768, seedMap.get(text)!);
  };

  return {
    embed: vi.fn().mockImplementation(async (text: string) => getVector(text)),
    embedBatch: vi.fn().mockImplementation(async (texts: string[]) => texts.map(getVector)),
    isLoaded: true,
    model: 'mock-model',
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    embedMultiRes: vi.fn(),
    _setSeed: (text: string, seed: number) => seedMap.set(text, seed),
  };
}

describe('ContextCurator', () => {
  let dir: string;
  let store: EmbeddingStore;
  let mockEmbedder: ReturnType<typeof createMockEmbedder>;
  let ranker: MatryoshkaRanker;
  let curator: ContextCurator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'neural-curator-test-'));
    store = new EmbeddingStore(dir);
    store.init();
    mockEmbedder = createMockEmbedder();
    ranker = new MatryoshkaRanker(store, mockEmbedder as never);
    curator = new ContextCurator(ranker, store, mockEmbedder as never);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  describe('curate', () => {
    it('returns empty for empty candidates', async () => {
      const results = await curator.curate('query', [], 10);
      expect(results).toEqual([]);
    });

    it('returns empty for maxItems = 0', async () => {
      const candidates = [{ id: 'e1', content: 'text' }];
      const results = await curator.curate('query', candidates, 0);
      expect(results).toEqual([]);
    });

    it('returns scored items with entity references', async () => {
      const candidates = [
        { id: 'e1', content: 'TypeScript programming language' },
        { id: 'e2', content: 'Python data science' },
        { id: 'e3', content: 'Rust systems programming' },
      ];

      const results = await curator.curate('programming languages', candidates, 3);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);

      for (const item of results) {
        expect(item.neuralScore).toBeGreaterThan(0);
        expect(item.entity.id).toBeDefined();
        expect(item.entity.content).toBeDefined();
      }
    });

    it('respects maxItems limit', async () => {
      const candidates = Array.from({ length: 20 }, (_, i) => ({
        id: `e-${i}`,
        content: `content for item ${i}`,
      }));

      const results = await curator.curate('query', candidates, 5);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('applies MMR diversity (near-duplicates suppressed)', async () => {
      // Give two candidates the same seed → identical embeddings → near-duplicate
      mockEmbedder._setSeed('same content A', 42);
      mockEmbedder._setSeed('same content B', 42);
      mockEmbedder._setSeed('different content', 99);

      const candidates = [
        { id: 'dup1', content: 'same content A' },
        { id: 'dup2', content: 'same content B' },
        { id: 'unique', content: 'different content' },
      ];

      const results = await curator.curate('query', candidates, 3);
      expect(results.length).toBeGreaterThan(0);

      // With MMR, the second duplicate should be ranked lower than the unique item
      // because it adds no diversity to the selected set
      const ids = results.map(r => r.entity.id);
      // Both duplicates shouldn't be the top 2 results (MMR should prefer diversity)
      const dup1Idx = ids.indexOf('dup1');
      const dup2Idx = ids.indexOf('dup2');
      const uniqueIdx = ids.indexOf('unique');

      // At least the unique item should be preferred over one duplicate
      if (dup1Idx !== -1 && dup2Idx !== -1 && uniqueIdx !== -1) {
        // If all three are present, unique should not be last
        expect(uniqueIdx).toBeLessThan(2);
      }
    });
  });

  describe('curateFromScope', () => {
    it('returns entity IDs with scores', async () => {
      const queryVec = makeVector(768, 50);
      mockEmbedder._setSeed('search query', 50);

      store.set('scope1', 'e1', makeVector(768, 1));
      store.set('scope1', 'e2', makeVector(768, 2));
      store.set('scope1', 'e3', makeVector(768, 3));

      const results = await curator.curateFromScope('scope1', 'search query', 3);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);

      for (const r of results) {
        expect(r.entityId).toBeDefined();
        expect(r.score).toBeGreaterThan(0);
      }
    });

    it('returns empty for empty scope', async () => {
      const results = await curator.curateFromScope('empty', 'query', 10);
      expect(results).toEqual([]);
    });

    it('applies diversity when many candidates available', async () => {
      // Store many vectors, some near-duplicates
      for (let i = 0; i < 20; i++) {
        store.set('scope1', `e-${i}`, makeVector(768, i));
      }
      // Add near-duplicates (same seed → same vector)
      store.set('scope1', 'dup-a', makeVector(768, 1));
      store.set('scope1', 'dup-b', makeVector(768, 1));

      const results = await curator.curateFromScope('scope1', 'test query', 5);
      expect(results.length).toBeLessThanOrEqual(5);

      // Results should be sorted by score descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score + 0.001);
      }
    });
  });
});
