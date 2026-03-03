import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { SnapshotInfo } from '../types/results.js';
import { RepoMemoryError } from '../types/errors.js';
import { safeJsonParse, safeJsonStringify } from '../serialization/json.js';

export class SnapshotManager {
  private readonly dir: string;
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.dir = join(baseDir, 'snapshots');
  }

  init(): void {
    mkdirSync(this.dir, { recursive: true });
  }

  create(label: string): SnapshotInfo {
    const id = `snap-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
    const snapDir = join(this.dir, id);
    mkdirSync(snapDir, { recursive: true });

    // Copy refs, index, VERSION
    for (const sub of ['refs', 'index', 'VERSION']) {
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
  }

  restore(snapshotId: string): void {
    const snapDir = join(this.dir, snapshotId);
    if (!existsSync(snapDir)) {
      throw new RepoMemoryError('NOT_FOUND', `Snapshot not found: ${snapshotId}`);
    }

    // Remove current refs and index, replace with snapshot
    for (const sub of ['refs', 'index']) {
      const target = join(this.baseDir, sub);
      if (existsSync(target)) rmSync(target, { recursive: true });
      const src = join(snapDir, sub);
      if (existsSync(src)) cpSync(src, target, { recursive: true });
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
