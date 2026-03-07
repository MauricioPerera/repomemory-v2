import { randomBytes } from 'node:crypto';
import { StorageEngine } from '../storage/engine.js';
import { SearchEngine } from '../search/search-engine.js';
import { AccessTracker } from '../storage/access-tracker.js';
import { computeScore, computeTagOverlap, daysBetween } from '../search/scoring.js';
import type { ScoringWeights } from '../search/scoring.js';
import { expandQuery } from '../search/query-expander.js';
import type { Entity, EntityType } from '../types/entities.js';
import type { SearchResult, CommitInfo, ListOptions, ListResult } from '../types/results.js';
import { RepoMemoryError } from '../types/errors.js';
import type { RepoMemoryEventBus } from '../events.js';
import type { MiddlewareChain } from '../middleware.js';

/** Extract agentId from any entity without double-casting */
function entityAgentId(entity: Entity): string {
  return (entity as { agentId: string }).agentId;
}

/** Extract userId from entity if present */
function entityUserId(entity: Entity): string | undefined {
  return 'userId' in entity ? (entity as { userId: string }).userId : undefined;
}

export abstract class BaseCollection<T extends Entity> {
  protected eventBus?: RepoMemoryEventBus;
  protected scoringWeights?: ScoringWeights;
  protected middlewareChain?: MiddlewareChain;

  constructor(
    protected readonly storage: StorageEngine,
    protected readonly searchEngine: SearchEngine,
    protected readonly entityType: EntityType,
    protected readonly accessTracker?: AccessTracker,
  ) {}

  setScoringWeights(weights: ScoringWeights): void {
    this.scoringWeights = weights;
  }

  setEventBus(eventBus: RepoMemoryEventBus): void {
    this.eventBus = eventBus;
  }

  setMiddleware(chain: MiddlewareChain): void {
    this.middlewareChain = chain;
  }

  protected abstract buildEntity(id: string, agentId: string, userId: string | undefined, input: Record<string, unknown>): T;
  protected abstract searchScope(agentId: string, userId?: string): string;

  save(agentId: string, userId: string | undefined, input: Record<string, unknown>): [T, CommitInfo] {
    const now = new Date().toISOString();
    const id = this.generateId();
    let entity = this.buildEntity(id, agentId, userId, {
      ...input,
      createdAt: now,
      updatedAt: now,
    });
    if (this.middlewareChain) {
      const result = this.middlewareChain.runBeforeSave(entity);
      if (result === null) {
        throw new RepoMemoryError('MIDDLEWARE_CANCELLED', `Save cancelled by middleware for ${this.entityType}`);
      }
      entity = result as T;
    }
    const commit = this.storage.save(entity);
    this.searchEngine.indexEntity(this.searchScope(agentId, userId), entity);
    if (this.eventBus) this.eventBus.emit('entity:save', { entity, commit });
    return [entity, commit];
  }

  saveMany(items: Array<{ agentId: string; userId: string | undefined; input: Record<string, unknown> }>): Array<[T, CommitInfo]> {
    const now = new Date().toISOString();
    const results: Array<[T, CommitInfo]> = [];
    for (const { agentId, userId, input } of items) {
      const id = this.generateId();
      let entity = this.buildEntity(id, agentId, userId, {
        ...input,
        createdAt: now,
        updatedAt: now,
      });
      if (this.middlewareChain) {
        const result = this.middlewareChain.runBeforeSave(entity);
        if (result === null) continue; // skip this item silently
        entity = result as T;
      }
      const commit = this.storage.save(entity);
      this.searchEngine.indexEntity(this.searchScope(agentId, userId), entity);
      results.push([entity, commit]);
      if (this.eventBus) this.eventBus.emit('entity:save', { entity, commit });
    }
    this.searchEngine.flush();
    return results;
  }

  update(entityId: string, updates: Partial<Record<string, unknown>>): [T, CommitInfo] {
    const existing = this.get(entityId);
    if (!existing) {
      throw new RepoMemoryError('NOT_FOUND', `Entity not found: ${entityId}`);
    }
    let finalUpdates = updates as Record<string, unknown>;
    if (this.middlewareChain) {
      const result = this.middlewareChain.runBeforeUpdate(existing, finalUpdates);
      if (result === null) {
        throw new RepoMemoryError('MIDDLEWARE_CANCELLED', `Update cancelled by middleware for ${entityId}`);
      }
      finalUpdates = result;
    }
    const updated = { ...existing, ...finalUpdates, updatedAt: new Date().toISOString() } as T;
    const commit = this.storage.save(updated);
    const agentId = entityAgentId(updated);
    const userId = entityUserId(updated);
    this.searchEngine.indexEntity(this.searchScope(agentId, userId), updated);
    if (this.eventBus) this.eventBus.emit('entity:update', { entity: updated, commit });
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
    if (this.middlewareChain && !this.middlewareChain.runBeforeDelete(entityId, this.entityType)) {
      throw new RepoMemoryError('MIDDLEWARE_CANCELLED', `Delete cancelled by middleware for ${entityId}`);
    }
    const agentId = entityAgentId(entity);
    const userId = entityUserId(entity);
    this.searchEngine.removeEntity(this.searchScope(agentId, userId), entityId);
    if (this.accessTracker) {
      this.accessTracker.remove(entityId);
    }
    const commit = this.storage.delete(entity);
    if (this.eventBus) this.eventBus.emit('entity:delete', { entityId, entityType: this.entityType, commit });
    return commit;
  }

  deleteMany(entityIds: string[]): CommitInfo[] {
    const commits: CommitInfo[] = [];
    for (const entityId of entityIds) {
      const entity = this.get(entityId);
      if (!entity) continue;
      if (this.middlewareChain && !this.middlewareChain.runBeforeDelete(entityId, this.entityType)) continue;
      const agentId = entityAgentId(entity);
      const userId = entityUserId(entity);
      this.searchEngine.removeEntity(this.searchScope(agentId, userId), entityId);
      if (this.accessTracker) this.accessTracker.remove(entityId);
      const commit = this.storage.delete(entity);
      if (this.eventBus) this.eventBus.emit('entity:delete', { entityId, entityType: this.entityType, commit });
      commits.push(commit);
    }
    this.searchEngine.flush();
    if (this.accessTracker) this.accessTracker.flush();
    return commits;
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

  listPaginated(agentId: string, userId: string | undefined, options?: ListOptions): ListResult<T> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const { items, total } = this.storage.listEntitiesPaginated(this.entityType, agentId, userId, limit, offset);
    const entities = items as T[];
    if (this.accessTracker) {
      for (const entity of entities) {
        if ('accessCount' in entity) {
          (entity as unknown as Record<string, unknown>).accessCount = this.accessTracker.get(entity.id);
        }
      }
    }
    return { items: entities, total, limit, offset, hasMore: offset + limit < total };
  }

  count(agentId: string, userId?: string): number {
    return this.storage.countEntities(this.entityType, agentId, userId);
  }

  find(agentId: string, userId: string | undefined, query: string, limit = 10): SearchResult<T>[] {
    this.searchEngine.flush(); // ensure pending index updates are applied before searching
    const scope = this.searchScope(agentId, userId);
    const expanded = expandQuery(query);
    const ranked = this.searchEngine.rank(scope, expanded, limit * 3);
    const queryTags = expanded.toLowerCase().split(/\s+/).filter(t => t.length > 1);
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
        weights: this.scoringWeights,
      });

      scored.push({ entity, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  findMultiScope(scopes: string[], query: string, limit = 10): SearchResult<T>[] {
    this.searchEngine.flush();
    const expanded = expandQuery(query);
    const ranked = this.searchEngine.rankMultiScope(scopes, expanded, limit * 3);
    const queryTags = expanded.toLowerCase().split(/\s+/).filter(t => t.length > 1);
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
        weights: this.scoringWeights,
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
