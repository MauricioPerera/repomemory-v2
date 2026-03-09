import type { Entity, EntityType } from './types/entities.js';

/** Exhaustive check — ensures all entity types are handled. */
function assertNever(x: never): never {
  throw new Error(`Unhandled entity type: ${String(x)}`);
}

/** Build search/lookup scope string from entity fields */
export function scopeFromEntity(entity: Entity): string {
  switch (entity.type) {
    case 'memory': return `memories:${entity.agentId}:${entity.userId}`;
    case 'skill': return `skills:${entity.agentId}`;
    case 'knowledge': return `knowledge:${entity.agentId}`;
    case 'session': return `sessions:${entity.agentId}:${entity.userId}`;
    case 'profile': return `profiles:${entity.agentId}:${entity.userId}`;
    default: return assertNever(entity);
  }
}

/** Build search/lookup scope string from type + agentId + userId */
export function scopeFromParts(type: EntityType, agentId: string, userId?: string): string {
  switch (type) {
    case 'memory': return `memories:${agentId}:${userId ?? ''}`;
    case 'skill': return `skills:${agentId}`;
    case 'knowledge': return `knowledge:${agentId}`;
    case 'session': return `sessions:${agentId}:${userId ?? ''}`;
    case 'profile': return `profiles:${agentId}:${userId ?? ''}`;
    default: return assertNever(type);
  }
}

/** Build ref path prefix from entity */
export function refBaseFromEntity(entity: Entity): string {
  switch (entity.type) {
    case 'memory': return `memories/${entity.agentId}/${entity.userId}`;
    case 'skill': return `skills/${entity.agentId}`;
    case 'knowledge': return `knowledge/${entity.agentId}`;
    case 'session': return `sessions/${entity.agentId}/${entity.userId}`;
    case 'profile': return `profiles/${entity.agentId}/${entity.userId}`;
    default: return assertNever(entity);
  }
}
