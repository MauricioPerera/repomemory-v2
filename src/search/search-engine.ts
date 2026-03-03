import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TfIdfIndex } from './tfidf.js';
import { safeJsonParse, safeJsonStringify } from '../serialization/json.js';
import { atomicWriteFileSync } from '../storage/atomic-write.js';
import type { Entity } from '../types/entities.js';
import type { TfIdfSerialized } from './tfidf.js';

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

  private getIndex(scope: string): TfIdfIndex {
    if (this.indices.has(scope)) return this.indices.get(scope)!;
    const cachePath = this.cachePath(scope);
    let index: TfIdfIndex;
    if (existsSync(cachePath)) {
      const data = safeJsonParse<TfIdfSerialized>(readFileSync(cachePath, 'utf8'));
      index = TfIdfIndex.deserialize(data);
    } else {
      index = new TfIdfIndex();
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
    return join(this.cacheDir, `${scope.replace(/:/g, '_')}.json`);
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
