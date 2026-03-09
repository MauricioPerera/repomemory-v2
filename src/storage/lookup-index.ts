import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { safeJsonParse, safeJsonStringify } from '../serialization/json.js';
import { atomicWriteFileSync } from './atomic-write.js';

/** Maximum number of scope-level maps to keep loaded. LRU eviction when exceeded. */
const MAX_LOADED_SCOPES = 200;

/** Maximum entries in globalIndex cache. Falls back to disk scan on miss. */
const MAX_GLOBAL_ENTRIES = 50_000;

export class LookupIndex {
  private readonly dir: string;
  private indices = new Map<string, Map<string, string>>();
  private globalIndex = new Map<string, string>();

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'index', 'lookup');
  }

  init(): void {
    mkdirSync(this.dir, { recursive: true });
    // Eagerly load all scopes into globalIndex for O(1) findById
    for (const scope of this.listScopeFiles()) {
      this.getScope(scope);
    }
  }

  set(scope: string, entityId: string, refPath: string): void {
    const map = this.getScope(scope);
    map.set(entityId, refPath);
    this.globalIndex.set(entityId, refPath);
    this.persist(scope);
  }

  get(scope: string, entityId: string): string | undefined {
    return this.getScope(scope).get(entityId);
  }

  delete(scope: string, entityId: string): boolean {
    const map = this.getScope(scope);
    const deleted = map.delete(entityId);
    if (deleted) {
      this.globalIndex.delete(entityId);
      this.persist(scope);
    }
    return deleted;
  }

  list(scope: string): Map<string, string> {
    return new Map(this.getScope(scope));
  }

  listByPrefix(prefix: string, maxResults?: number): Map<string, string> {
    const result = new Map<string, string>();
    const files = this.listScopeFiles();
    for (const scope of files) {
      if (!scope.startsWith(prefix)) continue;
      const map = this.getScope(scope);
      for (const [id, ref] of map) {
        result.set(id, ref);
        if (maxResults !== undefined && result.size >= maxResults) return result;
      }
    }
    return result;
  }

  findById(entityId: string): string | undefined {
    const cached = this.globalIndex.get(entityId);
    if (cached !== undefined) {
      // LRU touch: move to end
      this.globalIndex.delete(entityId);
      this.globalIndex.set(entityId, cached);
      return cached;
    }
    // Cache miss — fallback: scan scope files on disk
    for (const scope of this.listScopeFiles()) {
      const map = this.getScope(scope);
      const ref = map.get(entityId);
      if (ref !== undefined) return ref; // getScope() already populates globalIndex
    }
    return undefined;
  }

  private getScope(scope: string): Map<string, string> {
    if (this.indices.has(scope)) {
      // Move to end for LRU ordering
      const existing = this.indices.get(scope)!;
      this.indices.delete(scope);
      this.indices.set(scope, existing);
      return existing;
    }
    const path = this.scopePath(scope);
    let map: Map<string, string>;
    if (existsSync(path)) {
      const data = safeJsonParse<Record<string, string>>(readFileSync(path, 'utf8'), {});
      map = new Map(Object.entries(data));
    } else {
      map = new Map();
    }
    // Evict least recently used scope maps when over capacity
    // Note: globalIndex is NOT evicted — it stays complete for O(1) findById()
    while (this.indices.size >= MAX_LOADED_SCOPES) {
      const oldest = this.indices.keys().next().value;
      if (oldest === undefined) break;
      this.indices.delete(oldest);
    }
    this.indices.set(scope, map);
    for (const [id, ref] of map) {
      this.globalIndex.set(id, ref);
    }
    // Evict oldest globalIndex entries when over capacity
    while (this.globalIndex.size > MAX_GLOBAL_ENTRIES) {
      const oldest = this.globalIndex.keys().next().value;
      if (oldest === undefined) break;
      this.globalIndex.delete(oldest);
    }
    return map;
  }

  private persist(scope: string): void {
    const map = this.indices.get(scope);
    if (!map) return;
    atomicWriteFileSync(this.scopePath(scope), safeJsonStringify(Object.fromEntries(map)));
  }

  private scopePath(scope: string): string {
    return join(this.dir, `${encodeURIComponent(scope)}.json`);
  }

  private listScopeFiles(): string[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter(f => f.endsWith('.json'))
      .map(f => decodeURIComponent(f.replace('.json', '')));
  }
}
