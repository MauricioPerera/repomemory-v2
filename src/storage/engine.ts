import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ObjectStore } from './object-store.js';
import { CommitStore, TOMBSTONE } from './commit-store.js';
import { RefStore } from './ref-store.js';
import { LookupIndex } from './lookup-index.js';
import { AuditLog } from './audit-log.js';
import { LockGuard } from './lockfile.js';
import type { Entity, EntityType } from '../types/entities.js';
import type { CommitInfo } from '../types/results.js';
import { RepoMemoryError } from '../types/errors.js';

const VERSION = '2';

export class StorageEngine {
  readonly objects: ObjectStore;
  readonly commits: CommitStore;
  readonly refs: RefStore;
  readonly lookup: LookupIndex;
  readonly audit: AuditLog;
  readonly baseDir: string;
  private readonly lock: LockGuard;

  constructor(baseDir: string, lockEnabled = true) {
    this.baseDir = baseDir;
    this.objects = new ObjectStore(baseDir);
    this.commits = new CommitStore(baseDir);
    this.refs = new RefStore(baseDir);
    this.lookup = new LookupIndex(baseDir);
    this.audit = new AuditLog(baseDir);
    this.lock = new LockGuard(baseDir, lockEnabled);
  }

  init(): void {
    mkdirSync(this.baseDir, { recursive: true });
    this.objects.init();
    this.commits.init();
    this.refs.init();
    this.lookup.init();
    this.audit.init();
    const versionPath = join(this.baseDir, 'VERSION');
    if (!existsSync(versionPath)) {
      writeFileSync(versionPath, VERSION, 'utf8');
    }
  }

  isInitialized(): boolean {
    return existsSync(join(this.baseDir, 'VERSION'));
  }

  getVersion(): string {
    const versionPath = join(this.baseDir, 'VERSION');
    if (!existsSync(versionPath)) return '0';
    return readFileSync(versionPath, 'utf8').trim();
  }

  save(entity: Entity, author = 'system'): CommitInfo {
    return this.lock.withLock(() => {
      const objectHash = this.objects.write(entity.type, entity);
      const refPath = this.refPath(entity);
      const existingRef = this.refs.get(refPath);
      const parentHash = existingRef?.head ?? null;
      const message = parentHash ? `update ${entity.type}` : `create ${entity.type}`;
      const commit = this.commits.create(parentHash, objectHash, author, message);
      this.refs.set(refPath, commit.hash);
      const scope = this.lookupScope(entity);
      this.lookup.set(scope, entity.id, refPath);
      this.audit.append({
        operation: parentHash ? 'update' : 'create',
        entityType: entity.type,
        entityId: entity.id,
        commitHash: commit.hash,
        author,
      });
      return commit;
    });
  }

  load(entityId: string): Entity | null {
    const refPath = this.lookup.findById(entityId);
    if (!refPath) return null;
    const ref = this.refs.get(refPath);
    if (!ref) return null;
    const commit = this.commits.read(ref.head);
    if (commit.objectHash === TOMBSTONE) return null;
    const obj = this.objects.read(commit.objectHash);
    return obj.data as Entity;
  }

  delete(entity: Entity, author = 'system'): CommitInfo {
    return this.lock.withLock(() => {
      const refPath = this.refPath(entity);
      const existingRef = this.refs.get(refPath);
      if (!existingRef) {
        throw new RepoMemoryError('NOT_FOUND', `Entity not found: ${entity.id}`);
      }
      const commit = this.commits.create(existingRef.head, TOMBSTONE, author, `delete ${entity.type}`);
      this.refs.set(refPath, commit.hash);  // point ref to tombstone commit
      this.audit.append({
        operation: 'delete',
        entityType: entity.type,
        entityId: entity.id,
        commitHash: commit.hash,
        author,
      });
      return commit;
    });
  }

  history(entityId: string): CommitInfo[] {
    const refPath = this.lookup.findById(entityId);
    if (!refPath) {
      // Entity might be deleted but lookup still has data, or not found
      throw new RepoMemoryError('NOT_FOUND', `Entity not found: ${entityId}`);
    }
    const ref = this.refs.get(refPath);
    if (!ref) {
      throw new RepoMemoryError('NOT_FOUND', `Ref not found for entity: ${entityId}`);
    }
    return this.commits.history(ref.head);
  }

  listEntities(type: EntityType, agentId: string, userId?: string): Entity[] {
    const scope = this.buildScope(type, agentId, userId);
    const entries = this.lookup.list(scope);
    const entities: Entity[] = [];
    for (const [, refPath] of entries) {
      const ref = this.refs.get(refPath);
      if (!ref) continue;
      const commit = this.commits.read(ref.head);
      if (commit.objectHash === TOMBSTONE) continue;
      const obj = this.objects.read(commit.objectHash);
      entities.push(obj.data as Entity);
    }
    return entities;
  }

  countEntities(type: EntityType, agentId: string, userId?: string): number {
    const scope = this.buildScope(type, agentId, userId);
    const entries = this.lookup.list(scope);
    let count = 0;
    for (const [, refPath] of entries) {
      const ref = this.refs.get(refPath);
      if (!ref) continue;
      const commit = this.commits.read(ref.head);
      if (commit.objectHash !== TOMBSTONE) count++;
    }
    return count;
  }

  listEntitiesPaginated(type: EntityType, agentId: string, userId: string | undefined, limit: number, offset: number): { items: Entity[]; total: number } {
    const scope = this.buildScope(type, agentId, userId);
    const entries = [...this.lookup.list(scope)];
    const alive: Entity[] = [];
    for (const [, refPath] of entries) {
      const ref = this.refs.get(refPath);
      if (!ref) continue;
      const commit = this.commits.read(ref.head);
      if (commit.objectHash === TOMBSTONE) continue;
      alive.push(this.objects.read(commit.objectHash).data as Entity);
    }
    const total = alive.length;
    const items = alive.slice(offset, offset + limit);
    return { items, total };
  }

  listEntitiesByPrefix(prefix: string): Entity[] {
    const entries = this.lookup.listByPrefix(prefix);
    const entities: Entity[] = [];
    for (const [, refPath] of entries) {
      const ref = this.refs.get(refPath);
      if (!ref) continue;
      const commit = this.commits.read(ref.head);
      if (commit.objectHash === TOMBSTONE) continue;
      const obj = this.objects.read(commit.objectHash);
      entities.push(obj.data as Entity);
    }
    return entities;
  }

  private refPath(entity: Entity): string {
    const base = this.refBase(entity);
    return `${base}/${entity.id}.ref`;
  }

  private refBase(entity: Entity): string {
    switch (entity.type) {
      case 'memory': return `memories/${entity.agentId}/${entity.userId}`;
      case 'skill': return `skills/${entity.agentId}`;
      case 'knowledge': return `knowledge/${entity.agentId}`;
      case 'session': return `sessions/${entity.agentId}/${entity.userId}`;
      case 'profile': return `profiles/${entity.agentId}/${entity.userId}`;
    }
  }

  private lookupScope(entity: Entity): string {
    switch (entity.type) {
      case 'memory': return `memories:${entity.agentId}:${entity.userId}`;
      case 'skill': return `skills:${entity.agentId}`;
      case 'knowledge': return `knowledge:${entity.agentId}`;
      case 'session': return `sessions:${entity.agentId}:${entity.userId}`;
      case 'profile': return `profiles:${entity.agentId}:${entity.userId}`;
    }
  }

  private buildScope(type: EntityType, agentId: string, userId?: string): string {
    switch (type) {
      case 'memory': return `memories:${agentId}:${userId ?? ''}`;
      case 'skill': return `skills:${agentId}`;
      case 'knowledge': return `knowledge:${agentId}`;
      case 'session': return `sessions:${agentId}:${userId ?? ''}`;
      case 'profile': return `profiles:${agentId}:${userId ?? ''}`;
    }
  }
}
