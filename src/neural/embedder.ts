/**
 * Embedder — wraps @huggingface/transformers for EmbeddingGemma-300m inference.
 *
 * This is the ONLY file that imports @huggingface/transformers.
 * The dependency is optional: if not installed, ensureLoaded() throws a clear error.
 * All imports use dynamic `await import()` to avoid bundling the dependency.
 */

import type { MatryoshkaEmbedding, NeuralConfig } from './types.js';

const DEFAULT_MODEL = 'onnx-community/embeddinggemma-300m-ONNX';
const DEFAULT_DTYPE = 'q8';
const DEFAULT_DIMS: [number, number, number] = [128, 256, 768];

export class Embedder {
  private pipeline: ((text: string | string[], options?: Record<string, unknown>) => Promise<{ data: Float32Array }>) | null = null;
  private loading: Promise<void> | null = null;
  private readonly modelId: string;
  private readonly dtype: string;
  private readonly dimensions: number[];
  private readonly cacheDir?: string;

  constructor(config?: Partial<NeuralConfig>) {
    this.modelId = config?.model ?? DEFAULT_MODEL;
    this.dtype = config?.dtype ?? DEFAULT_DTYPE;
    this.dimensions = config?.dimensions ?? [...DEFAULT_DIMS];
    this.cacheDir = config?.cacheDir;
  }

  /** Lazy-load the model on first call. Safe to call multiple times. */
  async ensureLoaded(): Promise<void> {
    if (this.pipeline) return;
    if (this.loading) {
      await this.loading;
      return;
    }
    this.loading = this.loadModel();
    try {
      await this.loading;
    } catch (e) {
      this.loading = null;
      throw e;
    }
  }

  /**
   * Generate embedding for a single text.
   * Returns the full vector (highest dimension in config).
   * The vector is L2-normalized.
   */
  async embed(text: string): Promise<Float32Array> {
    await this.ensureLoaded();
    const result = await this.pipeline!(text, { pooling: 'mean', normalize: true });
    const fullDim = this.dimensions[this.dimensions.length - 1];
    return new Float32Array(result.data.slice(0, fullDim));
  }

  /**
   * Batch embed multiple texts. More efficient than sequential calls
   * when the underlying pipeline supports batching.
   */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    // Process sequentially — HF transformers.js handles internal batching
    const results: Float32Array[] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }

  /** Generate embeddings at all Matryoshka resolutions */
  async embedMultiRes(text: string): Promise<MatryoshkaEmbedding> {
    const full = await this.embed(text);
    return {
      dim128: full.slice(0, this.dimensions[0]),
      dim256: full.slice(0, this.dimensions[1]),
      dim768: full.slice(0, this.dimensions[2]),
    };
  }

  get isLoaded(): boolean {
    return this.pipeline !== null;
  }

  get model(): string {
    return this.modelId;
  }

  // ---------- Private ----------

  private async loadModel(): Promise<void> {
    let hf: { pipeline: (task: string, model: string, options?: Record<string, unknown>) => Promise<unknown> };

    try {
      hf = await import('@huggingface/transformers') as typeof hf;
    } catch {
      throw new Error(
        'Neural engine requires @huggingface/transformers. ' +
        'Install it with: npm install @huggingface/transformers',
      );
    }

    const options: Record<string, unknown> = { dtype: this.dtype };
    if (this.cacheDir) {
      options.cache_dir = this.cacheDir;
    }

    this.pipeline = await hf.pipeline('feature-extraction', this.modelId, options) as typeof this.pipeline;
  }
}
