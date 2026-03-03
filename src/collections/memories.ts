import { BaseCollection } from './base.js';
import type { Memory } from '../types/entities.js';
import type { SearchResult, CommitInfo } from '../types/results.js';
import type { StorageEngine } from '../storage/engine.js';
import type { SearchEngine } from '../search/search-engine.js';
import type { AccessTracker } from '../storage/access-tracker.js';

export class MemoryCollection extends BaseCollection<Memory> {
  constructor(storage: StorageEngine, search: SearchEngine, accessTracker?: AccessTracker) {
    super(storage, search, 'memory', accessTracker);
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
    if (this.accessTracker && results.length > 0) {
      this.accessTracker.incrementMany(results.map(r => r.entity.id));
    }
    return results;
  }

  saveOrUpdate(
    agentId: string,
    userId: string | undefined,
    input: Record<string, unknown>,
  ): [Memory, CommitInfo, { deduplicated: boolean }] {
    const category = (input.category as string) ?? 'fact';
    const content = input.content as string;
    const candidates = this.find(agentId, userId, content, 5);
    for (const { entity, score } of candidates) {
      if (entity.category === category && score >= 0.2) {
        const [updated, commit] = this.update(entity.id, {
          content,
          tags: (input.tags as string[]) ?? entity.tags,
          category,
        });
        return [updated, commit, { deduplicated: true }];
      }
    }
    const [saved, commit] = this.save(agentId, userId, input);
    return [saved, commit, { deduplicated: false }];
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
