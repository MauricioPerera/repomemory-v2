import { BaseCollection } from './base.js';
import type { Knowledge } from '../types/entities.js';
import { SHARED_AGENT_ID } from '../types/entities.js';
import type { SearchResult, CommitInfo } from '../types/results.js';
import type { StorageEngine } from '../storage/engine.js';
import type { SearchEngine } from '../search/search-engine.js';
import type { AccessTracker } from '../storage/access-tracker.js';

export class KnowledgeCollection extends BaseCollection<Knowledge> {
  constructor(storage: StorageEngine, search: SearchEngine, accessTracker?: AccessTracker) {
    super(storage, search, 'knowledge', accessTracker);
  }

  override save(agentId: string, _userId: string | undefined, input: Record<string, unknown>): [Knowledge, CommitInfo] {
    const normalized = {
      content: input.content as string,
      tags: (input.tags as string[]) ?? [],
      source: input.source,
      chunkIndex: input.chunkIndex,
      version: input.version,
      questions: input.questions,
      accessCount: (input.accessCount as number) ?? 0,
    };
    return super.save(agentId, undefined, normalized);
  }

  search(agentId: string, query: string, limit = 10, includeShared = false): SearchResult<Knowledge>[] {
    if (includeShared && agentId !== SHARED_AGENT_ID) {
      const scopes = [this.searchScope(agentId), this.searchScope(SHARED_AGENT_ID)];
      return this.findMultiScope(scopes, query, limit);
    }
    return this.find(agentId, undefined, query, limit);
  }

  saveShared(input: Record<string, unknown>): [Knowledge, CommitInfo] {
    return this.save(SHARED_AGENT_ID, undefined, input);
  }

  listShared(): Knowledge[] {
    return this.list(SHARED_AGENT_ID);
  }

  protected searchScope(agentId: string): string {
    return `knowledge:${agentId}`;
  }

  protected buildEntity(id: string, agentId: string, _userId: string | undefined, input: Record<string, unknown>): Knowledge {
    return {
      type: 'knowledge',
      id,
      agentId,
      content: input.content as string,
      tags: (input.tags as string[]) ?? [],
      source: input.source as string | undefined,
      chunkIndex: input.chunkIndex as number | undefined,
      version: input.version as string | undefined,
      questions: input.questions as string[] | undefined,
      accessCount: (input.accessCount as number) ?? 0,
      createdAt: input.createdAt as string,
      updatedAt: input.updatedAt as string,
    };
  }
}
