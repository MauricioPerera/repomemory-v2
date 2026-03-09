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
import { scopeFromEntity, scopeFromParts, refBaseFromEntity } from '../scoping.js';

const VERSION = '2';

/** Maximum content size in bytes (1 MB). Prevents DoS via oversized entities. */
const MAX_CONTENT_SIZE = 1_048_576;

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

  /**
   * Rebuild the lookup index from refs on disk.
   * Recovers from lookup/ref desynchronization caused by crashes mid-write.
   */
  rebuildLookupIndex(): { rebuilt: number; orphaned: number } {
    const allRefs = this.refs.listAll();
    let rebuilt = 0;
    let orphaned = 0;
    for (const refPath of allRefs) {
      const ref = this.refs.get(refPath);
      if (!ref) { orphaned++; continue; }
      try {
        const commit = this.commits.read(ref.head);
        if (commit.objectHash === TOMBSTONE) continue;
        const obj = this.objects.read(commit.objectHash);
        const entity = obj.data as Entity;
        const scope = scopeFromEntity(entity);
        this.lookup.set(scope, entity.id, refPath);
        rebuilt++;
      } catch {
        orphaned++;
      }
    }
    return { rebuilt, orphaned };
  }

  getVersion(): string {
    const versionPath = join(this.baseDir, 'VERSION');
    if (!existsSync(versionPath)) return '0';
    return readFileSync(versionPath, 'utf8').trim();
  }

  private validateId(value: string, name: string): void {
    if (!value || /[/\\:\0]/.test(value) || value.includes('..')) {
      throw new RepoMemoryError('INVALID_INPUT', `Invalid ${name}: contains illegal characters`);
    }
  }

  private validateEntity(entity: Entity): void {
    this.validateId(entity.id, 'id');
    if ('agentId' in entity) this.validateId((entity as { agentId: string }).agentId, 'agentId');
    if ('userId' in entity && (entity as { userId: string }).userId) {
      this.validateId((entity as { userId: string }).userId, 'userId');
    }
    // Prevent DoS via oversized content
    if ('content' in entity && typeof (entity as { content: string }).content === 'string') {
      const contentLen = Buffer.byteLength((entity as { content: string }).content, 'utf8');
      if (contentLen > MAX_CONTENT_SIZE) {
        throw new RepoMemoryError('INVALID_INPUT', `Content too large: ${contentLen} bytes (max ${MAX_CONTENT_SIZE})`);
      }
    }
  }

  save(entity: Entity, author = 'system'): CommitInfo {
    this.validateEntity(entity);
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
    this.validateEntity(entity);
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

  listEntitiesByPrefix(prefix: string, maxResults = 10_000): Entity[] {
    const entries = this.lookup.listByPrefix(prefix);
    const entities: Entity[] = [];
    for (const [, refPath] of entries) {
      if (entities.length >= maxResults) break;
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
    return `${refBaseFromEntity(entity)}/${entity.id}.ref`;
  }

  private lookupScope(entity: Entity): string {
    return scopeFromEntity(entity);
  }

  private buildScope(type: EntityType, agentId: string, userId?: string): string {
    return scopeFromParts(type, agentId, userId);
  }
}
