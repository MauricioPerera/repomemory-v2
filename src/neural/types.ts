/**
 * Types for the Neural Context Curator module.
 * Zero external dependencies — all interfaces are self-contained.
 */

/** Configuration for the neural embedding engine */
export interface NeuralConfig {
  /** Enable the neural engine. Default: false */
  enabled: boolean;
  /** HuggingFace model ID. Default: 'onnx-community/embeddinggemma-300m-ONNX' */
  model?: string;
  /** ONNX quantization dtype. Default: 'q8' */
  dtype?: string;
  /** Directory to cache downloaded model files. Default: HuggingFace default cache */
  cacheDir?: string;
  /** Matryoshka dimension levels (sorted ascending). Default: [128, 256, 768] */
  dimensions?: number[];
  /** Maximum scopes kept loaded in memory (LRU eviction). Default: 50 */
  maxLoadedScopes?: number;
}

/** Multi-resolution embedding at 3 Matryoshka levels */
export interface MatryoshkaEmbedding {
  /** Coarse embedding (first N dims of full vector) */
  dim128: Float32Array;
  /** Medium embedding */
  dim256: Float32Array;
  /** Full-precision embedding */
  dim768: Float32Array;
}

/** A stored embedding record associated with an entity */
export interface EmbeddingRecord {
  entityId: string;
  /** Full 768-dim vector (128 and 256 are slices of this) */
  vector: Float32Array;
}

/** Result of a similarity search */
export interface SimilarityResult {
  entityId: string;
  score: number;
}

/** Curated context item with score and optional entity reference */
export interface CuratedItem<T = unknown> {
  entity: T;
  neuralScore: number;
}

/** Diagnostic stats about the neural engine */
export interface NeuralStats {
  modelLoaded: boolean;
  modelId: string;
  dtype: string;
  dimensions: number[];
  totalVectors: number;
  loadedScopes: number;
  estimatedMemoryMB: number;
}

/** Serialized scope manifest (JSON file) */
export interface EmbeddingManifest {
  version: number;
  dim: number;
  ids: string[];
}
