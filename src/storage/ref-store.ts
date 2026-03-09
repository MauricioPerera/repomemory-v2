import { existsSync, mkdirSync, readFileSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve, isAbsolute, sep } from 'node:path';
import type { RefInfo } from '../types/results.js';
import { safeJsonParse, safeJsonStringify } from '../serialization/json.js';
import { atomicWriteFileSync } from './atomic-write.js';
import { RepoMemoryError } from '../types/errors.js';

export class RefStore {
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'refs');
  }

  init(): void {
    mkdirSync(this.dir, { recursive: true });
  }

  /**
   * Validate that a refPath stays within the refs directory.
   * Prevents path traversal attacks (e.g., "../../../etc/passwd").
   */
  private validateRefPath(refPath: string): string {
    if (!refPath || typeof refPath !== 'string') {
      throw new RepoMemoryError('INVALID_INPUT', 'refPath must be a non-empty string');
    }
    if (isAbsolute(refPath)) {
      throw new RepoMemoryError('INVALID_INPUT', `refPath must be relative, got absolute: ${refPath}`);
    }
    // Normalize and check for path traversal segments
    const segments = refPath.replace(/\\/g, '/').split('/');
    if (segments.some(s => s === '..')) {
      throw new RepoMemoryError('INVALID_INPUT', `refPath contains path traversal: ${refPath}`);
    }
    // Final check: resolved path must be inside this.dir
    const fullPath = resolve(this.dir, refPath);
    const normalizedDir = resolve(this.dir);
    if (!fullPath.startsWith(normalizedDir + sep) && fullPath !== normalizedDir) {
      throw new RepoMemoryError('INVALID_INPUT', `refPath escapes refs directory: ${refPath}`);
    }
    return fullPath;
  }

  set(refPath: string, commitHash: string): void {
    const fullPath = this.validateRefPath(refPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    const existing = this.get(refPath);
    const ref: RefInfo = {
      head: commitHash,
      created: existing?.created ?? new Date().toISOString(),
    };
    atomicWriteFileSync(fullPath, safeJsonStringify(ref));
  }

  get(refPath: string): RefInfo | null {
    const fullPath = this.validateRefPath(refPath);
    if (!existsSync(fullPath)) return null;
    return safeJsonParse<RefInfo>(readFileSync(fullPath, 'utf8'));
  }

  delete(refPath: string): boolean {
    const fullPath = this.validateRefPath(refPath);
    if (!existsSync(fullPath)) return false;
    unlinkSync(fullPath);
    return true;
  }

  list(prefix: string): string[] {
    // Validate prefix doesn't escape
    if (prefix && typeof prefix === 'string') {
      if (isAbsolute(prefix)) {
        throw new RepoMemoryError('INVALID_INPUT', `list prefix must be relative: ${prefix}`);
      }
      const segments = prefix.replace(/\\/g, '/').split('/');
      if (segments.some(s => s === '..')) {
        throw new RepoMemoryError('INVALID_INPUT', `list prefix contains path traversal: ${prefix}`);
      }
    }
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
