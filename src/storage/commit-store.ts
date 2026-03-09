import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from './object-store.js';
import { RepoMemoryError } from '../types/errors.js';
import type { CommitInfo } from '../types/results.js';
import { safeJsonParse, safeJsonStringify } from '../serialization/json.js';
import { atomicWriteFileSync } from './atomic-write.js';

export const TOMBSTONE = 'TOMBSTONE';

export class CommitStore {
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'commits');
  }

  init(): void {
    mkdirSync(this.dir, { recursive: true });
  }

  create(parent: string | null, objectHash: string, author: string, message: string): CommitInfo {
    const timestamp = new Date().toISOString();
    const commit: CommitInfo = { hash: '', parent, objectHash, timestamp, author, message };
    const content = safeJsonStringify({ parent, objectHash, timestamp, author, message });
    commit.hash = sha256(content);

    const path = this.hashPath(commit.hash);
    mkdirSync(join(this.dir, commit.hash.slice(0, 2)), { recursive: true });
    atomicWriteFileSync(path, safeJsonStringify(commit));
    return commit;
  }

  read(hash: string): CommitInfo {
    const path = this.hashPath(hash);
    if (!existsSync(path)) {
      throw new RepoMemoryError('NOT_FOUND', `Commit not found: ${hash}`);
    }
    return safeJsonParse<CommitInfo>(readFileSync(path, 'utf8'));
  }

  /** Maximum commit history depth to prevent stack overflow on cyclic or very long chains */
  static readonly MAX_HISTORY_DEPTH = 10_000;

  history(headHash: string, maxDepth: number = CommitStore.MAX_HISTORY_DEPTH): CommitInfo[] {
    const chain: CommitInfo[] = [];
    const visited = new Set<string>();
    let current: string | null = headHash;
    while (current) {
      if (chain.length >= maxDepth) break;
      if (visited.has(current)) break; // cycle detection
      visited.add(current);
      try {
        const commit = this.read(current);
        chain.push(commit);
        current = commit.parent;
      } catch {
        // Broken commit chain (missing/corrupted commit) — return partial history
        break;
      }
    }
    return chain;
  }

  exists(hash: string): boolean {
    return existsSync(this.hashPath(hash));
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
