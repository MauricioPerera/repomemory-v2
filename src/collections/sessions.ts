import { BaseCollection } from './base.js';
import type { Session, SessionMessage } from '../types/entities.js';
import type { CommitInfo } from '../types/results.js';
import type { StorageEngine } from '../storage/engine.js';
import type { SearchEngine } from '../search/search-engine.js';

export class SessionCollection extends BaseCollection<Session> {
  constructor(storage: StorageEngine, search: SearchEngine) {
    super(storage, search, 'session', undefined);
  }

  override save(agentId: string, userId: string | undefined, input: Record<string, unknown>): [Session, CommitInfo] {
    const normalized: Record<string, unknown> = {
      content: input.content as string,
      mined: (input.mined as boolean) ?? false,
      startedAt: (input.startedAt as string) ?? new Date().toISOString(),
      endedAt: input.endedAt,
    };
    if (input.messages) {
      normalized.messages = input.messages;
    }
    if (input.conversationId) {
      normalized.conversationId = input.conversationId;
    }
    return super.save(agentId, userId, normalized);
  }

  markMined(entityId: string): void {
    this.update(entityId, { mined: true });
  }

  listByConversation(agentId: string, userId: string, conversationId: string): Session[] {
    const all = this.list(agentId, userId);
    return all.filter(s => s.conversationId === conversationId);
  }

  listConversations(
    agentId: string,
    userId: string,
    options?: { limit?: number; offset?: number },
  ): { items: Array<{ conversationId: string; count: number; latest: string }>; total: number; hasMore: boolean; truncated?: boolean } {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    // Use paginated listing to avoid loading all sessions when possible.
    // We must scan enough sessions to build complete conversation groups,
    // so we use a bounded scan (max 5000 sessions) to prevent OOM.
    const MAX_SCAN = 5000;
    const { items: sessions, total: totalSessions } = this.listPaginated(agentId, userId, { limit: MAX_SCAN, offset: 0 });
    // Detect when scan was truncated — totals may be inaccurate
    const truncated = totalSessions > MAX_SCAN;
    const groups = new Map<string, { count: number; latest: string }>();
    for (const s of sessions) {
      if (!s.conversationId) continue;
      const existing = groups.get(s.conversationId);
      if (existing) {
        existing.count++;
        if (s.updatedAt > existing.latest) existing.latest = s.updatedAt;
      } else {
        groups.set(s.conversationId, { count: 1, latest: s.updatedAt });
      }
    }
    const sorted = Array.from(groups.entries())
      .map(([conversationId, { count, latest }]) => ({ conversationId, count, latest }))
      .sort((a, b) => b.latest.localeCompare(a.latest));
    const total = sorted.length;
    const items = sorted.slice(offset, offset + limit);
    return { items, total, hasMore: offset + limit < total, ...(truncated ? { truncated } : {}) };
  }

  protected searchScope(agentId: string, userId?: string): string {
    return `sessions:${agentId}:${userId ?? ''}`;
  }

  protected buildEntity(id: string, agentId: string, userId: string | undefined, input: Record<string, unknown>): Session {
    const entity: Session = {
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
    if (input.messages) {
      entity.messages = input.messages as SessionMessage[];
    }
    if (input.conversationId) {
      entity.conversationId = input.conversationId as string;
    }
    return entity;
  }
}
