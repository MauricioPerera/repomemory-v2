import { BaseCollection } from './base.js';
import type { Session } from '../types/entities.js';
import type { CommitInfo } from '../types/results.js';
import type { StorageEngine } from '../storage/engine.js';
import type { SearchEngine } from '../search/search-engine.js';

export class SessionCollection extends BaseCollection<Session> {
  constructor(storage: StorageEngine, search: SearchEngine) {
    super(storage, search, 'session', undefined);
  }

  override save(agentId: string, userId: string | undefined, input: Record<string, unknown>): [Session, CommitInfo] {
    const normalized = {
      content: input.content as string,
      mined: (input.mined as boolean) ?? false,
      startedAt: (input.startedAt as string) ?? new Date().toISOString(),
      endedAt: input.endedAt,
    };
    return super.save(agentId, userId, normalized);
  }

  markMined(entityId: string): void {
    this.update(entityId, { mined: true });
  }

  protected searchScope(agentId: string, userId?: string): string {
    return `sessions:${agentId}:${userId ?? ''}`;
  }

  protected buildEntity(id: string, agentId: string, userId: string | undefined, input: Record<string, unknown>): Session {
    return {
      type: 'session',
      id,
      agentId,
      userId: userId ?? '',
      content: input.content as string,
      mined: (input.mined as boolean) ?? false,
      startedAt: (input.startedAt as string) ?? new Date().toISOString(),
      endedAt: input.endedAt as string | undefined,
      createdAt: input.createdAt as string,
      updatedAt: input.updatedAt as string,
    };
  }
}
