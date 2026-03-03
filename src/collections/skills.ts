import { BaseCollection } from './base.js';
import type { Skill } from '../types/entities.js';
import type { SearchResult, CommitInfo } from '../types/results.js';
import type { StorageEngine } from '../storage/engine.js';
import type { SearchEngine } from '../search/search-engine.js';

export class SkillCollection extends BaseCollection<Skill> {
  constructor(storage: StorageEngine, search: SearchEngine) {
    super(storage, search, 'skill');
  }

  override save(agentId: string, _userId: string | undefined, input: Record<string, unknown>): [Skill, CommitInfo] {
    const normalized = {
      content: input.content as string,
      tags: (input.tags as string[]) ?? [],
      category: (input.category as string) ?? 'procedure',
      status: (input.status as string) ?? 'active',
      accessCount: (input.accessCount as number) ?? 0,
    };
    return super.save(agentId, undefined, normalized);
  }

  search(agentId: string, query: string, limit = 10): SearchResult<Skill>[] {
    return this.find(agentId, undefined, query, limit);
  }

  protected searchScope(agentId: string): string {
    return `skills:${agentId}`;
  }

  protected buildEntity(id: string, agentId: string, _userId: string | undefined, input: Record<string, unknown>): Skill {
    return {
      type: 'skill',
      id,
      agentId,
      content: input.content as string,
      tags: (input.tags as string[]) ?? [],
      category: (input.category as Skill['category']) ?? 'procedure',
      status: (input.status as Skill['status']) ?? 'active',
      accessCount: (input.accessCount as number) ?? 0,
      createdAt: input.createdAt as string,
      updatedAt: input.updatedAt as string,
    };
  }
}
