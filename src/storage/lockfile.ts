import { mkdirSync, rmdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STALE_THRESHOLD_MS = 30_000; // 30 seconds

export class Lockfile {
  private readonly lockDir: string;
  private acquired = false;

  constructor(baseDir: string) {
    this.lockDir = join(baseDir, '.lock');
  }

  acquire(): boolean {
    if (this.acquired) return true;

    try {
      // mkdirSync is atomic on POSIX and Windows — fails if already exists
      mkdirSync(this.lockDir);
      // Write PID for stale detection
      writeFileSync(join(this.lockDir, 'pid'), `${process.pid}`, 'utf8');
      this.acquired = true;
      return true;
    } catch {
      // Check for stale lock
      if (this.isStale()) {
        this.forceRelease();
        return this.acquire();
      }
      return false;
    }
  }

  release(): void {
    if (!this.acquired) return;
    try {
      // Remove PID file first, then directory
      const pidPath = join(this.lockDir, 'pid');
      if (existsSync(pidPath)) {
        const { unlinkSync } = require('node:fs') as typeof import('node:fs');
        unlinkSync(pidPath);
      }
      rmdirSync(this.lockDir);
    } catch {
      // Best-effort release
    }
    this.acquired = false;
  }

  private isStale(): boolean {
    try {
      const stat = statSync(this.lockDir);
      const age = Date.now() - stat.mtimeMs;
      return age > STALE_THRESHOLD_MS;
    } catch {
      return false;
    }
  }

  private forceRelease(): void {
    try {
      const pidPath = join(this.lockDir, 'pid');
      if (existsSync(pidPath)) {
        const { unlinkSync } = require('node:fs') as typeof import('node:fs');
        unlinkSync(pidPath);
      }
      rmdirSync(this.lockDir);
    } catch {
      // Ignore
    }
    this.acquired = false;
  }
}

export class LockGuard {
  private readonly lock: Lockfile;
  private readonly enabled: boolean;
  private readonly maxRetries: number;
  private readonly retryMs: number;

  constructor(baseDir: string, enabled = true, maxRetries = 50, retryMs = 20) {
    this.lock = new Lockfile(baseDir);
    this.enabled = enabled;
    this.maxRetries = maxRetries;
    this.retryMs = retryMs;
  }

  withLock<T>(fn: () => T): T {
    if (!this.enabled) return fn();

    let retries = 0;
    while (!this.lock.acquire()) {
      retries++;
      if (retries >= this.maxRetries) {
        throw new Error(`Failed to acquire lock after ${this.maxRetries} retries`);
      }
      // Synchronous sleep via busy-wait (safe for short durations in Node CLI tools)
      const start = Date.now();
      while (Date.now() - start < this.retryMs) {
        // busy-wait
      }
    }

    try {
      return fn();
    } finally {
      this.lock.release();
    }
  }
}
