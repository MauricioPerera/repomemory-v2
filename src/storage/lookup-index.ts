import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { safeJsonParse, safeJsonStringify } from '../serialization/json.js';

export class LookupIndex {
  private readonly dir: string;
  private indices = new Map<string, Map<string, string>>();

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'index', 'lookup');
  }

  init(): void {
    mkdirSync(this.dir, { recursive: true });
  }

  set(scope: string, entityId: string, refPath: string): void {
    const map = this.getScope(scope);
    map.set(entityId, refPath);
    this.persist(scope);
  }

  get(scope: string, entityId: string): string | undefined {
    return this.getScope(scope).get(entityId);
  }

  delete(scope: string, entityId: string): boolean {
    const map = this.getScope(scope);
    const deleted = map.delete(entityId);
    if (deleted) this.persist(scope);
    return deleted;
  }

  list(scope: string): Map<string, string> {
    return new Map(this.getScope(scope));
  }

  findById(entityId: string): string | undefined {
    for (const map of this.indices.values()) {
      const ref = map.get(entityId);
      if (ref) return ref;
    }
    // Search on disk
    const files = this.listScopeFiles();
    for (const scope of files) {
      if (this.indices.has(scope)) continue;
      const map = this.getScope(scope);
      const ref = map.get(entityId);
      if (ref) return ref;
    }
    return undefined;
  }

  private getScope(scope: string): Map<string, string> {
    if (this.indices.has(scope)) return this.indices.get(scope)!;
    const path = join(this.dir, `${scope}.json`);
    let map: Map<string, string>;
    if (existsSync(path)) {
      const data = safeJsonParse<Record<string, string>>(readFileSync(path, 'utf8'), {});
      map = new Map(Object.entries(data));
    } else {
      map = new Map();
    }
    this.indices.set(scope, map);
    return map;
  }

  private persist(scope: string): void {
    const map = this.indices.get(scope);
    if (!map) return;
    const path = join(this.dir, `${scope}.json`);
    writeFileSync(path, safeJsonStringify(Object.fromEntries(map)), 'utf8');
  }

  private listScopeFiles(): string[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  }
}
