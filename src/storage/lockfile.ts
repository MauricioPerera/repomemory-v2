import { mkdirSync, rmdirSync, statSync, existsSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const STALE_THRESHOLD_MS = 30_000; // 30 seconds

export class Lockfile {
  private readonly lockDir: string;
  private acquired = false;

  constructor(baseDir: string) {
    this.lockDir = join(baseDir, '.lock');
  }

  acquire(depth = 0): boolean {
    if (this.acquired) return true;
    if (depth > 2) return false;

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
        return this.acquire(depth + 1);
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
      // Check if the holding process is still alive via PID file
      const pidPath = join(this.lockDir, 'pid');
      if (existsSync(pidPath)) {
        const pid = parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
        if (!isNaN(pid)) {
          try { process.kill(pid, 0); return false; } // process alive = not stale
          catch { return true; } // process dead = stale regardless of age
        }
      }
      return age > STALE_THRESHOLD_MS;
    } catch {
      return false;
    }
  }

  private forceRelease(): void {
    try {
      const pidPath = join(this.lockDir, 'pid');
      if (existsSync(pidPath)) {
        unlinkSync(pidPath);
      }
      rmdirSync(this.lockDir);
    } catch {
      // Ignore
    }
    this.acquired = false;
  }
}

/**
 * Sleep using Atomics.wait (does NOT burn CPU like busy-wait).
 * Falls back to busy-wait only if SharedArrayBuffer is unavailable.
 */
function sleepMs(ms: number): void {
  try {
    const buf = new SharedArrayBuffer(4);
    const arr = new Int32Array(buf);
    Atomics.wait(arr, 0, 0, ms);
  } catch {
    // Fallback: busy-wait (only on environments without SharedArrayBuffer)
    const start = Date.now();
    while (Date.now() - start < ms) { /* spin */ }
  }
}

export class LockGuard {
  private readonly lock: Lockfile;
  private readonly enabled: boolean;
  private readonly maxRetries: number;
  private readonly baseRetryMs: number;

  constructor(baseDir: string, enabled = true, maxRetries = 20, baseRetryMs = 10) {
    this.lock = new Lockfile(baseDir);
    this.enabled = enabled;
    this.maxRetries = maxRetries;
    this.baseRetryMs = baseRetryMs;
  }

  withLock<T>(fn: () => T): T {
    if (!this.enabled) return fn();

    let retries = 0;
    while (!this.lock.acquire()) {
      retries++;
      if (retries >= this.maxRetries) {
        throw new Error(`Failed to acquire lock after ${this.maxRetries} retries`);
      }
      // Exponential backoff with jitter: baseMs * 2^retries + random jitter, capped at 500ms
      const delay = Math.min(this.baseRetryMs * Math.pow(2, retries) + Math.random() * 10, 500);
      sleepMs(Math.round(delay));
    }

    try {
      return fn();
    } finally {
      this.lock.release();
    }
  }
}
