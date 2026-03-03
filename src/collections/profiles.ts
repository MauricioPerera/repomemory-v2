import { BaseCollection } from './base.js';
import type { Profile } from '../types/entities.js';
import type { CommitInfo } from '../types/results.js';
import type { StorageEngine } from '../storage/engine.js';
import type { SearchEngine } from '../search/search-engine.js';

export class ProfileCollection extends BaseCollection<Profile> {
  constructor(storage: StorageEngine, search: SearchEngine) {
    super(storage, search, 'profile');
  }

  override save(agentId: string, userId: string | undefined, input: Record<string, unknown>): [Profile, CommitInfo] {
    const normalized = {
      content: input.content as string,
      metadata: (input.metadata as Record<string, unknown>) ?? {},
    };
    return super.save(agentId, userId, normalized);
  }

  getByUser(agentId: string, userId: string): Profile | null {
    const profiles = this.list(agentId, userId);
    return profiles[0] ?? null;
  }

  protected searchScope(agentId: string, userId?: string): string {
    return `profiles:${agentId}:${userId ?? ''}`;
  }

  protected buildEntity(id: string, agentId: string, userId: string | undefined, input: Record<string, unknown>): Profile {
    return {
      type: 'profile',
      id,
      agentId,
      userId: userId ?? '',
      content: input.content as string,
      metadata: (input.metadata as Record<string, unknown>) ?? {},
      createdAt: input.createdAt as string,
      updatedAt: input.updatedAt as string,
    };
  }
}
