import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Embedder } from '../../src/neural/embedder.js';

/**
 * Embedder tests use a mock @huggingface/transformers module.
 * The actual model is NOT downloaded during tests.
 */

// Mock the dynamic import of @huggingface/transformers
vi.mock('@huggingface/transformers', () => {
  const mockPipelineFn = async (text: string | string[], _options?: Record<string, unknown>) => {
    // Generate deterministic pseudo-embeddings from text
    const t = Array.isArray(text) ? text[0] : text;
    const vec = new Float32Array(768);
    for (let i = 0; i < 768; i++) {
      vec[i] = Math.sin((t.charCodeAt(i % t.length) + i) * 0.01);
    }
    // L2 normalize
    let norm = 0;
    for (let i = 0; i < 768; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < 768; i++) vec[i] /= norm;
    return { data: vec };
  };

  return {
    pipeline: vi.fn().mockResolvedValue(mockPipelineFn),
  };
});

describe('Embedder', () => {
  let embedder: Embedder;

  beforeEach(() => {
    embedder = new Embedder({ enabled: true });
  });

  describe('ensureLoaded', () => {
    it('loads the model on first call', async () => {
      expect(embedder.isLoaded).toBe(false);
      await embedder.ensureLoaded();
      expect(embedder.isLoaded).toBe(true);
    });

    it('does not double-load on concurrent calls', async () => {
      const fresh = new Embedder({ enabled: true });
      const { pipeline: mockPipeline } = await import('@huggingface/transformers');
      const callsBefore = (mockPipeline as ReturnType<typeof vi.fn>).mock.calls.length;
      const p1 = fresh.ensureLoaded();
      const p2 = fresh.ensureLoaded();
      await Promise.all([p1, p2]);
      const callsAfter = (mockPipeline as ReturnType<typeof vi.fn>).mock.calls.length;
      // pipeline() should be called only once for these concurrent calls
      expect(callsAfter - callsBefore).toBe(1);
    });

    it('is idempotent after loading', async () => {
      await embedder.ensureLoaded();
      await embedder.ensureLoaded(); // should not throw
      expect(embedder.isLoaded).toBe(true);
    });
  });

  describe('embed', () => {
    it('returns Float32Array of full dimension', async () => {
      const vec = await embedder.embed('hello world');
      expect(vec).toBeInstanceOf(Float32Array);
      expect(vec.length).toBe(768);
    });

    it('returns normalized vectors', async () => {
      const vec = await embedder.embed('test text');
      let norm = 0;
      for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
      expect(Math.sqrt(norm)).toBeCloseTo(1.0, 3);
    });

    it('returns deterministic results for same input', async () => {
      const v1 = await embedder.embed('deterministic');
      const v2 = await embedder.embed('deterministic');
      for (let i = 0; i < v1.length; i++) {
        expect(v1[i]).toBeCloseTo(v2[i], 5);
      }
    });

    it('returns different results for different inputs', async () => {
      const v1 = await embedder.embed('hello');
      const v2 = await embedder.embed('completely different text');
      let same = true;
      for (let i = 0; i < v1.length; i++) {
        if (Math.abs(v1[i] - v2[i]) > 0.01) { same = false; break; }
      }
      expect(same).toBe(false);
    });
  });

  describe('embedBatch', () => {
    it('returns array of vectors', async () => {
      const vecs = await embedder.embedBatch(['text1', 'text2', 'text3']);
      expect(vecs.length).toBe(3);
      for (const v of vecs) {
        expect(v).toBeInstanceOf(Float32Array);
        expect(v.length).toBe(768);
      }
    });

    it('returns empty array for empty input', async () => {
      const vecs = await embedder.embedBatch([]);
      expect(vecs).toEqual([]);
    });
  });

  describe('embedMultiRes', () => {
    it('returns all three Matryoshka resolutions', async () => {
      const res = await embedder.embedMultiRes('multi-resolution test');
      expect(res.dim128.length).toBe(128);
      expect(res.dim256.length).toBe(256);
      expect(res.dim768.length).toBe(768);
    });

    it('Matryoshka dimensions are prefix-consistent', async () => {
      const res = await embedder.embedMultiRes('consistency check');
      // dim128 should be the first 128 elements of dim768
      for (let i = 0; i < 128; i++) {
        expect(res.dim128[i]).toBeCloseTo(res.dim768[i], 5);
      }
      // dim256 should be the first 256 elements of dim768
      for (let i = 0; i < 256; i++) {
        expect(res.dim256[i]).toBeCloseTo(res.dim768[i], 5);
      }
    });
  });

  describe('custom config', () => {
    it('uses default model when not specified', () => {
      const e = new Embedder();
      expect(e.model).toBe('onnx-community/embeddinggemma-300m-ONNX');
    });

    it('uses custom model when specified', () => {
      const e = new Embedder({ enabled: true, model: 'custom/model' });
      expect(e.model).toBe('custom/model');
    });
  });
});
