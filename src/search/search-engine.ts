import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TfIdfIndex } from './tfidf.js';
import { computeScore, computeTagOverlap, daysBetween } from './scoring.js';
import { safeJsonParse, safeJsonStringify } from '../serialization/json.js';
import type { Entity } from '../types/entities.js';
import type { SearchResult } from '../types/results.js';
import type { TfIdfSerialized } from './tfidf.js';

export class SearchEngine {
  private indices = new Map<string, TfIdfIndex>();
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
    this.persistIndex(scope);
  }

  removeEntity(scope: string, entityId: string): void {
    const index = this.getIndex(scope);
    if (index.removeDocument(entityId)) {
      this.persistIndex(scope);
    }
  }

  search(scope: string, query: string, entities: Entity[], limit = 10): SearchResult[] {
    const index = this.getIndex(scope);
    const tfidfResults = index.search(query, limit * 3);
    const entityMap = new Map(entities.map(e => [e.id, e]));
    const queryTags = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    const now = new Date();

    const scored: SearchResult[] = [];
    for (const { id, score: tfidfScore } of tfidfResults) {
      const entity = entityMap.get(id);
      if (!entity) continue;

      const tags = 'tags' in entity ? (entity.tags as string[]) : [];
      const accessCount = 'accessCount' in entity ? (entity.accessCount as number) : 0;
      const updatedAt = entity.updatedAt;

      const score = computeScore({
        tfidfScore,
        tagOverlap: computeTagOverlap(tags, queryTags),
        daysSinceUpdate: daysBetween(updatedAt, now),
        accessCount,
      });

      scored.push({ entity, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
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
    writeFileSync(cachePath, safeJsonStringify(index.serialize()), 'utf8');
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
