import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RepoMemoryError } from '../types/errors.js';
import { safeJsonParse, safeJsonStringify } from '../serialization/json.js';
import { atomicWriteFileSync } from './atomic-write.js';

export interface StoredObject {
  type: string;
  data: unknown;
}

export class ObjectStore {
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'objects');
  }

  init(): void {
    mkdirSync(this.dir, { recursive: true });
  }

  write(type: string, data: unknown): string {
    const content = safeJsonStringify({ type, data });
    const hash = sha256(content);
    const path = this.hashPath(hash);
    if (!existsSync(path)) {
      mkdirSync(join(this.dir, hash.slice(0, 2)), { recursive: true });
      atomicWriteFileSync(path, content);
    }
    return hash;
  }

  read(hash: string): StoredObject {
    const path = this.hashPath(hash);
    if (!existsSync(path)) {
      throw new RepoMemoryError('NOT_FOUND', `Object not found: ${hash}`);
    }
    return safeJsonParse<StoredObject>(readFileSync(path, 'utf8'));
  }

  exists(hash: string): boolean {
    return existsSync(this.hashPath(hash));
  }

  verify(hash: string): boolean {
    const path = this.hashPath(hash);
    if (!existsSync(path)) return false;
    const content = readFileSync(path, 'utf8');
    return sha256(content) === hash;
  }

  listAll(): string[] {
    const hashes: string[] = [];
    if (!existsSync(this.dir)) return hashes;
    for (const prefix of readdirSync(this.dir)) {
      const prefixDir = join(this.dir, prefix);
      try {
        if (!statSync(prefixDir).isDirectory()) continue;
        for (const file of readdirSync(prefixDir)) {
          if (file.endsWith('.json')) hashes.push(file.replace('.json', ''));
        }
      } catch {
        // Skip entries that can't be read (stray files, permission errors)
      }
    }
    return hashes;
  }

  private hashPath(hash: string): string {
    return join(this.dir, hash.slice(0, 2), `${hash}.json`);
  }
}

export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
