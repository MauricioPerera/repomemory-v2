import type { Entity, EntityType } from './types/entities.js';

export interface Middleware {
  /** Called before save/saveMany. Return transformed entity, or null to cancel the save. */
  beforeSave?(entity: Entity): Entity | null;
  /** Called before update. Return transformed updates, or null to cancel the update. */
  beforeUpdate?(entity: Entity, updates: Record<string, unknown>): Record<string, unknown> | null;
  /** Called before delete/deleteMany. Return false to prevent deletion. */
  beforeDelete?(entityId: string, entityType: EntityType): boolean;
}

export class MiddlewareChain {
  private readonly middlewares: Middleware[] = [];

  use(mw: Middleware): void {
    this.middlewares.push(mw);
  }

  runBeforeSave(entity: Entity): Entity | null {
    let current: Entity | null = entity;
    for (const mw of this.middlewares) {
      if (!mw.beforeSave) continue;
      current = mw.beforeSave(current);
      if (current === null) return null;
    }
    return current;
  }

  runBeforeUpdate(entity: Entity, updates: Record<string, unknown>): Record<string, unknown> | null {
    let current: Record<string, unknown> | null = updates;
    for (const mw of this.middlewares) {
      if (!mw.beforeUpdate) continue;
      current = mw.beforeUpdate(entity, current);
      if (current === null) return null;
    }
    return current;
  }

  runBeforeDelete(entityId: string, entityType: EntityType): boolean {
    for (const mw of this.middlewares) {
      if (!mw.beforeDelete) continue;
      if (!mw.beforeDelete(entityId, entityType)) return false;
    }
    return true;
  }

  get length(): number {
    return this.middlewares.length;
  }
}
