import { BaseCollection } from './base.js';
import type { Memory } from '../types/entities.js';
import type { SearchResult, CommitInfo } from '../types/results.js';
import type { StorageEngine } from '../storage/engine.js';
import type { SearchEngine } from '../search/search-engine.js';

export class MemoryCollection extends BaseCollection<Memory> {
  constructor(storage: StorageEngine, search: SearchEngine) {
    super(storage, search, 'memory');
  }

  override save(agentId: string, userId: string | undefined, input: Record<string, unknown>): [Memory, CommitInfo] {
    const normalized = {
      content: input.content as string,
      tags: (input.tags as string[]) ?? [],
      category: (input.category as string) ?? 'fact',
      sourceSession: input.sourceSession,
      accessCount: (input.accessCount as number) ?? 0,
    };
    return super.save(agentId, userId, normalized);
  }

  search(agentId: string, userId: string, query: string, limit = 10): SearchResult<Memory>[] {
    const results = this.find(agentId, userId, query, limit);
    for (const r of results) {
      this.incrementAccess(r.entity.id);
    }
    return results;
  }

  private incrementAccess(entityId: string): void {
    const entity = this.get(entityId);
    if (entity) {
      this.update(entityId, { accessCount: entity.accessCount + 1 });
    }
  }

  protected searchScope(agentId: string, userId?: string): string {
    return `memories:${agentId}:${userId ?? ''}`;
  }

  protected buildEntity(id: string, agentId: string, userId: string | undefined, input: Record<string, unknown>): Memory {
    return {
      type: 'memory',
      id,
      agentId,
      userId: userId ?? '',
      content: input.content as string,
      tags: (input.tags as string[]) ?? [],
      category: (input.category as Memory['category']) ?? 'fact',
      sourceSession: input.sourceSession as string | undefined,
      accessCount: (input.accessCount as number) ?? 0,
      createdAt: input.createdAt as string,
      updatedAt: input.updatedAt as string,
    };
  }
}
