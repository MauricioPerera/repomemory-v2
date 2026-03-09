/**
 * EmbeddingStore — Per-scope binary vector storage with LRU eviction.
 *
 * Storage format (per scope):
 *   {dir}/index/embeddings/{encoded_scope}.json — manifest with entity IDs
 *   {dir}/index/embeddings/{encoded_scope}.bin  — raw Float32 vectors (768 floats each)
 *
 * Matryoshka trick: store full 768-dim vector once; at query time compare
 * only the first N dimensions (128/256/768) by passing dimSlice to search().
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { EmbeddingRecord, EmbeddingManifest, SimilarityResult } from './types.js';

const DEFAULT_MAX_SCOPES = 50;
const VECTOR_DIM = 768;
const FORMAT_VERSION = 1;
const BYTES_PER_FLOAT = 4;
const BYTES_PER_VECTOR = VECTOR_DIM * BYTES_PER_FLOAT;

/** In-memory index for one scope */
interface ScopeIndex {
  ids: string[];
  /** Contiguous Float32Array: ids.length × VECTOR_DIM floats */
  vectors: Float32Array;
  /** Fast entityId → index lookup */
  idMap: Map<string, number>;
}

export class EmbeddingStore {
  private scopes = new Map<string, ScopeIndex>();
  private dirty = new Set<string>();
  private accessOrder: string[] = [];  // LRU tracking
  private readonly dir: string;
  private readonly maxLoadedScopes: number;

  constructor(baseDir: string, maxLoadedScopes = DEFAULT_MAX_SCOPES) {
    this.dir = join(baseDir, 'index', 'embeddings');
    this.maxLoadedScopes = maxLoadedScopes;
  }

  init(): void {
    mkdirSync(this.dir, { recursive: true });
  }

  /** Store or overwrite a vector for an entity within a scope */
  set(scope: string, entityId: string, vector: Float32Array): void {
    const idx = this.getOrCreateScope(scope);
    const existing = idx.idMap.get(entityId);

    if (existing !== undefined) {
      // Overwrite in place
      idx.vectors.set(vector.subarray(0, VECTOR_DIM), existing * VECTOR_DIM);
    } else {
      // Append: grow the vectors array
      const newVectors = new Float32Array(idx.vectors.length + VECTOR_DIM);
      newVectors.set(idx.vectors);
      newVectors.set(vector.subarray(0, VECTOR_DIM), idx.vectors.length);
      idx.vectors = newVectors;
      idx.idMap.set(entityId, idx.ids.length);
      idx.ids.push(entityId);
    }
    this.dirty.add(scope);
  }

  /** Remove a vector for an entity. Returns true if it existed. */
  remove(scope: string, entityId: string): boolean {
    const idx = this.tryGetScope(scope);
    if (!idx) return false;

    const position = idx.idMap.get(entityId);
    if (position === undefined) return false;

    const lastIdx = idx.ids.length - 1;
    if (position !== lastIdx) {
      // Swap with last element
      const lastId = idx.ids[lastIdx];
      idx.ids[position] = lastId;
      idx.idMap.set(lastId, position);
      // Copy last vector into removed position
      const srcOffset = lastIdx * VECTOR_DIM;
      const dstOffset = position * VECTOR_DIM;
      idx.vectors.copyWithin(dstOffset, srcOffset, srcOffset + VECTOR_DIM);
    }

    // Remove last element
    idx.ids.pop();
    idx.idMap.delete(entityId);
    idx.vectors = idx.vectors.subarray(0, idx.ids.length * VECTOR_DIM);

    this.dirty.add(scope);
    return true;
  }

  /** Get a single embedding record */
  get(scope: string, entityId: string): EmbeddingRecord | null {
    const idx = this.tryGetScope(scope);
    if (!idx) return null;

    const position = idx.idMap.get(entityId);
    if (position === undefined) return null;

    const offset = position * VECTOR_DIM;
    return {
      entityId,
      vector: idx.vectors.slice(offset, offset + VECTOR_DIM),
    };
  }

  /** Get all records for a scope */
  getAll(scope: string): EmbeddingRecord[] {
    const idx = this.tryGetScope(scope);
    if (!idx) return [];

    return idx.ids.map((entityId, i) => ({
      entityId,
      vector: idx.vectors.slice(i * VECTOR_DIM, (i + 1) * VECTOR_DIM),
    }));
  }

  /** Count of vectors in a scope */
  count(scope: string): number {
    const idx = this.tryGetScope(scope);
    return idx ? idx.ids.length : 0;
  }

  /** Total vectors across all loaded scopes */
  totalVectors(): number {
    let total = 0;
    for (const idx of this.scopes.values()) {
      total += idx.ids.length;
    }
    return total;
  }

  /**
   * Cosine similarity search within a scope.
   *
   * @param scope - The scope to search
   * @param queryVector - Query vector (must be at least dimSlice long)
   * @param dimSlice - Number of dimensions to compare (128, 256, or 768)
   * @param limit - Max results to return
   * @returns Results sorted by cosine similarity descending
   */
  search(scope: string, queryVector: Float32Array, dimSlice: number, limit: number): SimilarityResult[] {
    const idx = this.tryGetScope(scope);
    if (!idx || idx.ids.length === 0) return [];

    const dims = Math.min(dimSlice, VECTOR_DIM);
    const results: SimilarityResult[] = [];

    for (let i = 0; i < idx.ids.length; i++) {
      const offset = i * VECTOR_DIM;
      const score = cosineSimilarity(queryVector, idx.vectors, 0, offset, dims);
      if (score > 0) {
        results.push({ entityId: idx.ids[i], score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Multi-scope search. Merges results across scopes, keeping max score per entity.
   */
  searchMultiScope(scopes: string[], queryVector: Float32Array, dimSlice: number, limit: number): SimilarityResult[] {
    const merged = new Map<string, number>();

    for (const scope of scopes) {
      const results = this.search(scope, queryVector, dimSlice, limit);
      for (const r of results) {
        const existing = merged.get(r.entityId) ?? 0;
        if (r.score > existing) {
          merged.set(r.entityId, r.score);
        }
      }
    }

    const all: SimilarityResult[] = [];
    for (const [entityId, score] of merged) {
      all.push({ entityId, score });
    }
    all.sort((a, b) => b.score - a.score);
    return all.slice(0, limit);
  }

  /** Persist all dirty scopes to disk */
  flush(): void {
    for (const scope of this.dirty) {
      this.persistScope(scope);
    }
    this.dirty.clear();
  }

  /** Diagnostic stats */
  stats(): { loadedScopes: number; totalVectors: number; estimatedMemoryMB: number } {
    const totalVectors = this.totalVectors();
    return {
      loadedScopes: this.scopes.size,
      totalVectors,
      // Each vector = 768 floats × 4 bytes = 3072 bytes ≈ 3KB
      estimatedMemoryMB: Math.round((totalVectors * BYTES_PER_VECTOR) / (1024 * 1024) * 100) / 100,
    };
  }

  // ---------- Private ----------

  /** Get scope from cache or load from disk. Creates empty if not found. */
  private getOrCreateScope(scope: string): ScopeIndex {
    let idx = this.scopes.get(scope);
    if (idx) {
      this.touchLru(scope);
      return idx;
    }

    idx = this.loadFromDisk(scope) ?? { ids: [], vectors: new Float32Array(0), idMap: new Map() };
    this.addScope(scope, idx);
    return idx;
  }

  /** Get scope from cache or load from disk. Returns null if not found. */
  private tryGetScope(scope: string): ScopeIndex | null {
    const cached = this.scopes.get(scope);
    if (cached) {
      this.touchLru(scope);
      return cached;
    }

    const loaded = this.loadFromDisk(scope);
    if (loaded) {
      this.addScope(scope, loaded);
    }
    return loaded;
  }

  private addScope(scope: string, idx: ScopeIndex): void {
    this.scopes.set(scope, idx);
    this.accessOrder.push(scope);
    this.evictLru();
  }

  private touchLru(scope: string): void {
    const pos = this.accessOrder.indexOf(scope);
    if (pos !== -1) {
      this.accessOrder.splice(pos, 1);
    }
    this.accessOrder.push(scope);
  }

  private evictLru(): void {
    while (this.scopes.size > this.maxLoadedScopes && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift()!;
      if (this.dirty.has(oldest)) {
        this.persistScope(oldest);
        this.dirty.delete(oldest);
      }
      this.scopes.delete(oldest);
    }
  }

  /** Load a scope from disk */
  private loadFromDisk(scope: string): ScopeIndex | null {
    const jsonPath = this.scopePath(scope, '.json');
    const binPath = this.scopePath(scope, '.bin');

    if (!existsSync(jsonPath) || !existsSync(binPath)) return null;

    try {
      const manifest: EmbeddingManifest = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      if (manifest.version !== FORMAT_VERSION) return null;

      const buffer = readFileSync(binPath);
      const vectors = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / BYTES_PER_FLOAT);

      // Validate: vector count must match ids count
      const expectedFloats = manifest.ids.length * manifest.dim;
      if (vectors.length < expectedFloats) return null;

      const idMap = new Map<string, number>();
      for (let i = 0; i < manifest.ids.length; i++) {
        idMap.set(manifest.ids[i], i);
      }

      return { ids: [...manifest.ids], vectors: vectors.slice(0, expectedFloats), idMap };
    } catch {
      return null;
    }
  }

  /** Persist a single scope to disk */
  private persistScope(scope: string): void {
    const idx = this.scopes.get(scope);
    if (!idx) return;

    if (idx.ids.length === 0) {
      // Clean up empty scope files
      const jsonPath = this.scopePath(scope, '.json');
      const binPath = this.scopePath(scope, '.bin');
      if (existsSync(jsonPath)) unlinkSync(jsonPath);
      if (existsSync(binPath)) unlinkSync(binPath);
      return;
    }

    const manifest: EmbeddingManifest = {
      version: FORMAT_VERSION,
      dim: VECTOR_DIM,
      ids: idx.ids,
    };

    writeFileSync(this.scopePath(scope, '.json'), JSON.stringify(manifest));

    // Write binary data
    const buffer = Buffer.from(idx.vectors.buffer, idx.vectors.byteOffset, idx.vectors.byteLength);
    writeFileSync(this.scopePath(scope, '.bin'), buffer);
  }

  /**
   * Scope filename encoding.
   * Matches SearchEngine convention: encodeURIComponent each segment, replace _ → %5F.
   */
  private scopePath(scope: string, ext: string): string {
    const encoded = scope.split(':').map(s =>
      encodeURIComponent(s).replace(/_/g, '%5F'),
    ).join('_');
    return join(this.dir, `${encoded}${ext}`);
  }
}

/**
 * Cosine similarity between two vectors at specified offsets.
 * Compares only the first `dims` elements starting from aOffset and bOffset.
 */
export function cosineSimilarity(
  a: Float32Array, b: Float32Array,
  aOffset: number, bOffset: number,
  dims: number,
): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < dims; i++) {
    const ai = a[aOffset + i];
    const bi = b[bOffset + i];
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
