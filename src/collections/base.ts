import { randomBytes } from 'node:crypto';
import { StorageEngine } from '../storage/engine.js';
import { SearchEngine } from '../search/search-engine.js';
import type { Entity, EntityType } from '../types/entities.js';
import type { SearchResult, CommitInfo } from '../types/results.js';
import { RepoMemoryError } from '../types/errors.js';

export abstract class BaseCollection<T extends Entity> {
  constructor(
    protected readonly storage: StorageEngine,
    protected readonly searchEngine: SearchEngine,
    protected readonly entityType: EntityType,
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
    return [entity, commit];
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
    return [updated, commit];
  }

  get(entityId: string): T | null {
    const entity = this.storage.load(entityId);
    if (!entity || entity.type !== this.entityType) return null;
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
    return this.storage.delete(entity);
  }

  list(agentId: string, userId?: string): T[] {
    return this.storage.listEntities(this.entityType, agentId, userId) as T[];
  }

  find(agentId: string, userId: string | undefined, query: string, limit = 10): SearchResult<T>[] {
    const entities = this.list(agentId, userId);
    const scope = this.searchScope(agentId, userId);
    return this.searchEngine.search(scope, query, entities, limit) as SearchResult<T>[];
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
