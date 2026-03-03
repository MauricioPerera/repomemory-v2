import { randomBytes } from 'node:crypto';
import { StorageEngine } from '../storage/engine.js';
import { SearchEngine } from '../search/search-engine.js';
import { AccessTracker } from '../storage/access-tracker.js';
import { computeScore, computeTagOverlap, daysBetween } from '../search/scoring.js';
import type { Entity, EntityType } from '../types/entities.js';
import type { SearchResult, CommitInfo } from '../types/results.js';
import { RepoMemoryError } from '../types/errors.js';

export abstract class BaseCollection<T extends Entity> {
  constructor(
    protected readonly storage: StorageEngine,
    protected readonly searchEngine: SearchEngine,
    protected readonly entityType: EntityType,
    protected readonly accessTracker?: AccessTracker,
  ) {}

  protected abstract buildEntity(id: string, agentId: string, userId: string | undefined, input: Record<string, unknown>): T;
  protected abstract searchScope(agentId: string, userId?: string): string;

  save(agentId: string, userId: string | undefined, input: Record<string, unknown>): [T, CommitInfo] {
    const now = new Date().toISOString();
    const id = this.generateId();
    const entity = this.buildEntity(id, agentId, userId, {
      ...input,
      createdAt: now,
      updatedAt: now,
    });
    const commit = this.storage.save(entity);
    this.searchEngine.indexEntity(this.searchScope(agentId, userId), entity);
    this.searchEngine.flush();
    return [entity, commit];
  }

  saveMany(items: Array<{ agentId: string; userId: string | undefined; input: Record<string, unknown> }>): Array<[T, CommitInfo]> {
    const now = new Date().toISOString();
    const results: Array<[T, CommitInfo]> = [];
    for (const { agentId, userId, input } of items) {
      const id = this.generateId();
      const entity = this.buildEntity(id, agentId, userId, {
        ...input,
        createdAt: now,
        updatedAt: now,
      });
      const commit = this.storage.save(entity);
      this.searchEngine.indexEntity(this.searchScope(agentId, userId), entity);
      results.push([entity, commit]);
    }
    this.searchEngine.flush();
    return results;
  }

  update(entityId: string, updates: Partial<Record<string, unknown>>): [T, CommitInfo] {
    const existing = this.get(entityId);
    if (!existing) {
      throw new RepoMemoryError('NOT_FOUND', `Entity not found: ${entityId}`);
    }
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() } as T;
    const commit = this.storage.save(updated);
    const agentId = (updated as unknown as { agentId: string }).agentId;
    const userId = 'userId' in updated ? (updated as unknown as { userId: string }).userId : undefined;
    this.searchEngine.indexEntity(this.searchScope(agentId, userId), updated);
    this.searchEngine.flush();
    return [updated, commit];
  }

  get(entityId: string): T | null {
    const entity = this.storage.load(entityId);
    if (!entity || entity.type !== this.entityType) return null;
    if (this.accessTracker && 'accessCount' in entity) {
      (entity as unknown as Record<string, unknown>).accessCount = this.accessTracker.get(entityId);
    }
    return entity as T;
  }

  delete(entityId: string): CommitInfo {
    const entity = this.get(entityId);
    if (!entity) {
      throw new RepoMemoryError('NOT_FOUND', `Entity not found: ${entityId}`);
    }
    const agentId = (entity as unknown as { agentId: string }).agentId;
    const userId = 'userId' in entity ? (entity as unknown as { userId: string }).userId : undefined;
    this.searchEngine.removeEntity(this.searchScope(agentId, userId), entityId);
    this.searchEngine.flush();
    if (this.accessTracker) {
      this.accessTracker.remove(entityId);
      this.accessTracker.flush();
    }
    return this.storage.delete(entity);
  }

  list(agentId: string, userId?: string): T[] {
    const entities = this.storage.listEntities(this.entityType, agentId, userId) as T[];
    if (this.accessTracker) {
      for (const entity of entities) {
        if ('accessCount' in entity) {
          (entity as unknown as Record<string, unknown>).accessCount = this.accessTracker.get(entity.id);
        }
      }
    }
    return entities;
  }

  find(agentId: string, userId: string | undefined, query: string, limit = 10): SearchResult<T>[] {
    const scope = this.searchScope(agentId, userId);
    const ranked = this.searchEngine.rank(scope, query, limit * 3);
    const queryTags = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    const now = new Date();

    const scored: SearchResult<T>[] = [];
    for (const { id, tfidfScore } of ranked) {
      const entity = this.get(id);
      if (!entity) continue;

      const tags = 'tags' in entity ? (entity.tags as string[]) : [];
      const accessCount = 'accessCount' in entity ? (entity.accessCount as number) : 0;

      const score = computeScore({
        tfidfScore,
        tagOverlap: computeTagOverlap(tags, queryTags),
        daysSinceUpdate: daysBetween(entity.updatedAt, now),
        accessCount,
      });

      scored.push({ entity, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  history(entityId: string): CommitInfo[] {
    return this.storage.history(entityId);
  }

  protected generateId(): string {
    const ts = Date.now().toString(36);
    const rand = randomBytes(3).toString('hex');
    return `${this.entityType}-${ts}-${rand}`;
  }
}
