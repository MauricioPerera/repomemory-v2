import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { SnapshotInfo } from '../types/results.js';
import { RepoMemoryError } from '../types/errors.js';
import { safeJsonParse, safeJsonStringify } from '../serialization/json.js';
import type { LockGuard } from './lockfile.js';

export class SnapshotManager {
  private readonly dir: string;
  private readonly baseDir: string;
  private readonly lockPath: string;
  private readonly lockGuard?: LockGuard;

  constructor(baseDir: string, lockGuard?: LockGuard) {
    this.baseDir = baseDir;
    this.dir = join(baseDir, 'snapshots');
    this.lockPath = join(baseDir, '.restore.lock');
    this.lockGuard = lockGuard;
  }

  init(): void {
    mkdirSync(this.dir, { recursive: true });
  }

  create(label: string): SnapshotInfo {
    const doCreate = (): SnapshotInfo => {
      const id = `snap-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
      const snapDir = join(this.dir, id);
      mkdirSync(snapDir, { recursive: true });

      // Copy refs, index, objects, commits, VERSION
      for (const sub of ['refs', 'index', 'objects', 'commits', 'VERSION']) {
        const src = join(this.baseDir, sub);
        if (existsSync(src)) {
          cpSync(src, join(snapDir, sub), { recursive: true });
        }
      }

      // Count refs
      const refsDir = join(snapDir, 'refs');
      const refCount = existsSync(refsDir) ? this.countFiles(refsDir) : 0;

      const info: SnapshotInfo = {
        id,
        label,
        timestamp: new Date().toISOString(),
        refCount,
      };
      writeFileSync(join(snapDir, 'snapshot.json'), safeJsonStringify(info, true), 'utf8');
      return info;
    };

    // Acquire write lock during snapshot to prevent concurrent writes from corrupting the snapshot
    return this.lockGuard ? this.lockGuard.withLock(doCreate) : doCreate();
  }

  private acquireLock(): void {
    if (existsSync(this.lockPath)) {
      // Check for stale lock (older than 5 minutes)
      const lockAge = Date.now() - statSync(this.lockPath).mtimeMs;
      if (lockAge < 5 * 60 * 1000) {
        throw new RepoMemoryError('SNAPSHOT_ERROR', 'Another restore operation is in progress');
      }
      // Stale lock — remove and proceed
      unlinkSync(this.lockPath);
    }
    writeFileSync(this.lockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), 'utf8');
  }

  private releaseLock(): void {
    if (existsSync(this.lockPath)) {
      unlinkSync(this.lockPath);
    }
  }

  restore(snapshotId: string): void {
    const snapDir = join(this.dir, snapshotId);
    if (!existsSync(snapDir)) {
      throw new RepoMemoryError('NOT_FOUND', `Snapshot not found: ${snapshotId}`);
    }

    const subs = ['refs', 'index', 'objects', 'commits'];

    // Validate: ensure snapshot has at least some data before destructive restore
    const hasData = subs.some(sub => existsSync(join(snapDir, sub)));
    if (!hasData) {
      throw new RepoMemoryError('INVALID_INPUT', `Snapshot ${snapshotId} contains no data directories`);
    }

    // Acquire lock to prevent concurrent restores
    this.acquireLock();

    try {
      // Stage 1: Copy snapshot data into temporary staging area
      const stagingDir = join(this.baseDir, '.restore-staging');
      if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true });
      mkdirSync(stagingDir, { recursive: true });
      for (const sub of subs) {
        const src = join(snapDir, sub);
        if (existsSync(src)) cpSync(src, join(stagingDir, sub), { recursive: true });
      }

      // Validate staging: ensure all expected dirs were copied before destructive step
      for (const sub of subs) {
        const src = join(snapDir, sub);
        const staged = join(stagingDir, sub);
        if (existsSync(src) && !existsSync(staged)) {
          // Stage 1 failed partially — clean up staging and abort
          rmSync(stagingDir, { recursive: true });
          throw new RepoMemoryError('SNAPSHOT_ERROR', `Staging failed: ${sub} was not copied`);
        }
      }

      // Stage 2: Remove current data and move staged data into place
      for (const sub of subs) {
        const target = join(this.baseDir, sub);
        if (existsSync(target)) rmSync(target, { recursive: true });
        const staged = join(stagingDir, sub);
        if (existsSync(staged)) cpSync(staged, target, { recursive: true });
      }

      // Cleanup staging
      rmSync(stagingDir, { recursive: true });
    } finally {
      this.releaseLock();
    }
  }

  list(): SnapshotInfo[] {
    if (!existsSync(this.dir)) return [];
    const snapshots: SnapshotInfo[] = [];
    for (const entry of readdirSync(this.dir)) {
      const metaPath = join(this.dir, entry, 'snapshot.json');
      if (existsSync(metaPath)) {
        snapshots.push(safeJsonParse<SnapshotInfo>(readFileSync(metaPath, 'utf8')));
      }
    }
    return snapshots.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  private countFiles(dir: string): number {
    let count = 0;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        count += this.countFiles(full);
      } else {
        count++;
      }
    }
    return count;
  }
}
