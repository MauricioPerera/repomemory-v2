import { BaseCollection } from './base.js';
import type { Skill } from '../types/entities.js';
import { SHARED_AGENT_ID } from '../types/entities.js';
import type { SearchResult, CommitInfo } from '../types/results.js';
import type { StorageEngine } from '../storage/engine.js';
import type { SearchEngine } from '../search/search-engine.js';
import type { AccessTracker } from '../storage/access-tracker.js';

export class SkillCollection extends BaseCollection<Skill> {
  constructor(storage: StorageEngine, search: SearchEngine, accessTracker?: AccessTracker) {
    super(storage, search, 'skill', accessTracker);
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

  search(agentId: string, query: string, limit = 10, includeShared = false): SearchResult<Skill>[] {
    if (includeShared && agentId !== SHARED_AGENT_ID) {
      const scopes = [this.searchScope(agentId), this.searchScope(SHARED_AGENT_ID)];
      return this.findMultiScope(scopes, query, limit);
    }
    return this.find(agentId, undefined, query, limit);
  }

  saveOrUpdate(
    agentId: string,
    input: Record<string, unknown>,
    dedupThreshold = 0.2,
  ): [Skill, CommitInfo, { deduplicated: boolean }] {
    const content = input.content as string;
    const category = (input.category as string) ?? 'procedure';
    const candidates = this.find(agentId, undefined, content, 5);
    for (const { entity, score } of candidates) {
      if (entity.category === category && score >= dedupThreshold) {
        const [updated, commit] = this.update(entity.id, {
          content,
          tags: (input.tags as string[]) ?? entity.tags,
          category,
          status: (input.status as string) ?? entity.status,
        });
        return [updated, commit, { deduplicated: true }];
      }
    }
    const [saved, commit] = this.save(agentId, undefined, input);
    return [saved, commit, { deduplicated: false }];
  }

  saveShared(input: Record<string, unknown>): [Skill, CommitInfo] {
    return this.save(SHARED_AGENT_ID, undefined, input);
  }

  listShared(): Skill[] {
    return this.list(SHARED_AGENT_ID);
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
