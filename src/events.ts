import { EventEmitter } from 'node:events';
import type { Entity, EntityType } from './types/entities.js';
import type { CommitInfo } from './types/results.js';

export interface RepoMemoryEvents {
  'entity:save': { entity: Entity; commit: CommitInfo };
  'entity:update': { entity: Entity; commit: CommitInfo };
  'entity:delete': { entityId: string; entityType: EntityType; commit: CommitInfo };
  'session:mined': { sessionId: string };
  'session:automine:error': { sessionId: string; error: string };
  'consolidation:done': { type: string; agentId: string };
}

export type EventName = keyof RepoMemoryEvents;
export type EventHandler<K extends EventName> = (payload: RepoMemoryEvents[K]) => void;

export class RepoMemoryEventBus {
  private readonly emitter = new EventEmitter();

  on<K extends EventName>(event: K, handler: EventHandler<K>): void {
    this.emitter.on(event, handler as (...args: unknown[]) => void);
  }

  off<K extends EventName>(event: K, handler: EventHandler<K>): void {
    this.emitter.off(event, handler as (...args: unknown[]) => void);
  }

  emit<K extends EventName>(event: K, payload: RepoMemoryEvents[K]): void {
    try {
      this.emitter.emit(event, payload);
    } catch {
      // Swallow handler errors to protect core operations
    }
  }
}
