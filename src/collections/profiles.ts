import { BaseCollection } from './base.js';
import type { Profile } from '../types/entities.js';
import { SHARED_AGENT_ID } from '../types/entities.js';
import type { CommitInfo } from '../types/results.js';
import type { StorageEngine } from '../storage/engine.js';
import type { SearchEngine } from '../search/search-engine.js';

export class ProfileCollection extends BaseCollection<Profile> {
  constructor(storage: StorageEngine, search: SearchEngine) {
    super(storage, search, 'profile', undefined);
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
    if (profiles.length === 0) return null;
    if (profiles.length === 1) return profiles[0];
    return profiles.reduce((a, b) => a.updatedAt > b.updatedAt ? a : b);
  }

  getByUserAcrossAgents(userId: string): Profile[] {
    const prefix = `profiles:`;
    const entities = this.storage.listEntitiesByPrefix(prefix);
    const profiles = entities.filter(
      (e): e is Profile => e.type === 'profile' && e.userId === userId,
    );
    profiles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return profiles;
  }

  saveShared(userId: string, input: Record<string, unknown>): [Profile, CommitInfo] {
    return this.save(SHARED_AGENT_ID, userId, input);
  }

  getSharedByUser(userId: string): Profile | null {
    return this.getByUser(SHARED_AGENT_ID, userId);
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
