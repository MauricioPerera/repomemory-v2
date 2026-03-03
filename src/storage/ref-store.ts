import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import type { RefInfo } from '../types/results.js';
import { safeJsonParse, safeJsonStringify } from '../serialization/json.js';

export class RefStore {
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'refs');
  }

  init(): void {
    mkdirSync(this.dir, { recursive: true });
  }

  set(refPath: string, commitHash: string): void {
    const fullPath = join(this.dir, refPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    const existing = this.get(refPath);
    const ref: RefInfo = {
      head: commitHash,
      created: existing?.created ?? new Date().toISOString(),
    };
    writeFileSync(fullPath, safeJsonStringify(ref), 'utf8');
  }

  get(refPath: string): RefInfo | null {
    const fullPath = join(this.dir, refPath);
    if (!existsSync(fullPath)) return null;
    return safeJsonParse<RefInfo>(readFileSync(fullPath, 'utf8'));
  }

  delete(refPath: string): boolean {
    const fullPath = join(this.dir, refPath);
    if (!existsSync(fullPath)) return false;
    unlinkSync(fullPath);
    return true;
  }

  list(prefix: string): string[] {
    const fullDir = join(this.dir, prefix);
    if (!existsSync(fullDir)) return [];
    return this.walkRefs(fullDir).map(p => relative(this.dir, p));
  }

  listAll(): string[] {
    if (!existsSync(this.dir)) return [];
    return this.walkRefs(this.dir).map(p => relative(this.dir, p));
  }

  private walkRefs(dir: string): string[] {
    const result: string[] = [];
    if (!existsSync(dir)) return result;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        result.push(...this.walkRefs(full));
      } else if (entry.endsWith('.ref')) {
        result.push(full);
      }
    }
    return result;
  }
}
