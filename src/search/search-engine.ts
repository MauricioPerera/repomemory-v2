import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TfIdfIndex } from './tfidf.js';
import { safeJsonParse, safeJsonStringify } from '../serialization/json.js';
import { atomicWriteFileSync } from '../storage/atomic-write.js';
import type { Entity } from '../types/entities.js';
import type { TfIdfSerialized } from './tfidf.js';

/** Maximum number of TF-IDF indices to keep loaded in memory. LRU eviction when exceeded. */
const MAX_LOADED_INDICES = 100;

export class SearchEngine {
  private indices = new Map<string, TfIdfIndex>();
  private dirty = new Set<string>();
  private readonly cacheDir: string;

  constructor(baseDir: string) {
    this.cacheDir = join(baseDir, 'index', 'tfidf');
  }

  init(): void {
    mkdirSync(this.cacheDir, { recursive: true });
  }

  indexEntity(scope: string, entity: Entity): void {
    const index = this.getIndex(scope);
    const text = this.extractText(entity);
    index.addDocument(entity.id, text);
    this.dirty.add(scope);
  }

  removeEntity(scope: string, entityId: string): void {
    const index = this.getIndex(scope);
    if (index.removeDocument(entityId)) {
      this.dirty.add(scope);
    }
  }

  rank(scope: string, query: string, limit: number): Array<{ id: string; tfidfScore: number }> {
    const index = this.getIndex(scope);
    const results = index.search(query, limit);
    return results.map(r => ({ id: r.id, tfidfScore: r.score }));
  }

  rankMultiScope(scopes: string[], query: string, limit: number): Array<{ id: string; tfidfScore: number }> {
    const merged = new Map<string, number>();
    for (const scope of scopes) {
      const results = this.rank(scope, query, limit);
      for (const { id, tfidfScore } of results) {
        const existing = merged.get(id) ?? 0;
        if (tfidfScore > existing) merged.set(id, tfidfScore);
      }
    }
    return Array.from(merged.entries())
      .map(([id, tfidfScore]) => ({ id, tfidfScore }))
      .sort((a, b) => b.tfidfScore - a.tfidfScore)
      .slice(0, limit);
  }

  flush(): void {
    for (const scope of this.dirty) {
      this.persistIndex(scope);
    }
    this.dirty.clear();
  }

  /** Returns diagnostic info about loaded indices. */
  indexStats(): { scopes: number; totalDocuments: number; scopeDetails: Array<{ scope: string; documents: number }> } {
    let totalDocuments = 0;
    const scopeDetails: Array<{ scope: string; documents: number }> = [];
    for (const [scope, index] of this.indices) {
      const docs = index.size;
      totalDocuments += docs;
      scopeDetails.push({ scope, documents: docs });
    }
    return { scopes: this.indices.size, totalDocuments, scopeDetails };
  }

  private getIndex(scope: string): TfIdfIndex {
    if (this.indices.has(scope)) {
      // Move to end for LRU ordering (most recently used = last)
      const idx = this.indices.get(scope)!;
      this.indices.delete(scope);
      this.indices.set(scope, idx);
      return idx;
    }
    const cachePath = this.cachePath(scope);
    let index: TfIdfIndex;
    if (existsSync(cachePath)) {
      const data = safeJsonParse<TfIdfSerialized>(readFileSync(cachePath, 'utf8'));
      index = TfIdfIndex.deserialize(data);
    } else {
      // Fallback: try legacy cache paths from older versions
      // v2.10.x: encodeURIComponent per segment joined with _ (but didn't encode _)
      const v210Name = scope.split(':').map(s => encodeURIComponent(s)).join('_');
      const v210Path = join(this.cacheDir, `${v210Name}.json`);
      // pre-v2.10: simple colon→underscore replacement
      const prePath = join(this.cacheDir, `${scope.replace(/:/g, '_')}.json`);

      const legacyPath = (v210Path !== cachePath && existsSync(v210Path)) ? v210Path
        : (prePath !== cachePath && existsSync(prePath)) ? prePath
        : null;

      if (legacyPath) {
        const data = safeJsonParse<TfIdfSerialized>(readFileSync(legacyPath, 'utf8'));
        index = TfIdfIndex.deserialize(data);
        this.dirty.add(scope); // re-persist under new path
      } else {
        index = new TfIdfIndex();
      }
    }
    // Evict least recently used indices when over capacity
    while (this.indices.size >= MAX_LOADED_INDICES) {
      const oldest = this.indices.keys().next().value;
      if (oldest === undefined) break;
      // Persist before evicting if dirty
      if (this.dirty.has(oldest)) {
        this.persistIndex(oldest);
        this.dirty.delete(oldest);
      }
      this.indices.delete(oldest);
    }
    this.indices.set(scope, index);
    return index;
  }

  private persistIndex(scope: string): void {
    const index = this.indices.get(scope);
    if (!index) return;
    const cachePath = this.cachePath(scope);
    atomicWriteFileSync(cachePath, safeJsonStringify(index.serialize()));
  }

  private cachePath(scope: string): string {
    // Encode each segment separately to prevent collisions.
    // encodeURIComponent does NOT encode underscore (_), so we must
    // also replace _ → %5F to make _ a safe join separator.
    // e.g., "memories:agent_1:user" → "memories_agent%5F1_user"
    //        "memories:agent:1_user" → "memories_agent_1%5Fuser"  (different!)
    const safeName = scope.split(':').map(s =>
      encodeURIComponent(s).replace(/_/g, '%5F'),
    ).join('_');
    return join(this.cacheDir, `${safeName}.json`);
  }

  private extractText(entity: Entity): string {
    const parts: string[] = [entity.type];
    if ('content' in entity) parts.push(entity.content);
    if ('tags' in entity && Array.isArray(entity.tags)) parts.push(entity.tags.join(' '));
    if ('category' in entity && entity.category) parts.push(entity.category as string);
    if ('questions' in entity && Array.isArray(entity.questions)) parts.push(entity.questions.join(' '));
    return parts.join(' ');
  }
}
