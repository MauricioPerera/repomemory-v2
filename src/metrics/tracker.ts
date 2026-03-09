/**
 * CTT (Context-Time Training) metrics tracker.
 * Tracks effectiveness metrics per agent per day.
 * Lightweight — stores JSON files outside the entity/commit system.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CttMetrics {
  agentId: string;
  period: string;                // ISO date (YYYY-MM-DD)
  recallCalls: number;           // Total recall invocations
  recallHits: number;            // Recalls that returned >0 items
  totalItemsReturned: number;    // Sum of items returned across all recall calls
  totalTopScore: number;         // Sum of top-item scores (for averaging)
  correctionsApplied: number;    // Number of corrections saved
  miningExtractions: number;     // Total mining runs
  uniqueQueries: string[];       // Distinct queries seen (capped at 100)
}

/** Empty metrics for a given agent/date */
function emptyMetrics(agentId: string, period: string): CttMetrics {
  return {
    agentId,
    period,
    recallCalls: 0,
    recallHits: 0,
    totalItemsReturned: 0,
    totalTopScore: 0,
    correctionsApplied: 0,
    miningExtractions: 0,
    uniqueQueries: [],
  };
}

const MAX_UNIQUE_QUERIES = 100;

export class MetricsTracker {
  private readonly baseDir: string;
  /** In-memory cache: key = "agentId:date" */
  private readonly cache = new Map<string, CttMetrics>();
  private dirty = new Set<string>();

  constructor(storageDir: string) {
    this.baseDir = join(storageDir, 'metrics');
  }

  /** Get today's date as YYYY-MM-DD */
  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Key for cache lookup */
  private key(agentId: string, date: string): string {
    return `${agentId}:${date}`;
  }

  /** Directory for an agent's metrics */
  private agentDir(agentId: string): string {
    return join(this.baseDir, encodeURIComponent(agentId));
  }

  /** File path for a specific day */
  private filePath(agentId: string, date: string): string {
    return join(this.agentDir(agentId), `${date}.json`);
  }

  /** Load or create metrics for agent+date */
  private getOrCreate(agentId: string, date: string): CttMetrics {
    const k = this.key(agentId, date);
    const cached = this.cache.get(k);
    if (cached) return cached;

    const path = this.filePath(agentId, date);
    if (existsSync(path)) {
      try {
        const data = JSON.parse(readFileSync(path, 'utf8')) as CttMetrics;
        this.cache.set(k, data);
        return data;
      } catch {
        // Corrupted file — start fresh
      }
    }

    const fresh = emptyMetrics(agentId, date);
    this.cache.set(k, fresh);
    return fresh;
  }

  /** Track a recall invocation */
  trackRecall(agentId: string, query: string, itemsReturned: number, topScore: number): void {
    const date = this.today();
    const m = this.getOrCreate(agentId, date);
    m.recallCalls++;
    if (itemsReturned > 0) m.recallHits++;
    m.totalItemsReturned += itemsReturned;
    m.totalTopScore += topScore;
    if (m.uniqueQueries.length < MAX_UNIQUE_QUERIES && !m.uniqueQueries.includes(query)) {
      m.uniqueQueries.push(query);
    }
    this.dirty.add(this.key(agentId, date));
  }

  /** Track a correction being saved */
  trackCorrection(agentId: string): void {
    const date = this.today();
    const m = this.getOrCreate(agentId, date);
    m.correctionsApplied++;
    this.dirty.add(this.key(agentId, date));
  }

  /** Track a mining extraction */
  trackMining(agentId: string): void {
    const date = this.today();
    const m = this.getOrCreate(agentId, date);
    m.miningExtractions++;
    this.dirty.add(this.key(agentId, date));
  }

  /** Flush dirty metrics to disk */
  flush(): void {
    for (const k of this.dirty) {
      const m = this.cache.get(k);
      if (!m) continue;
      const dir = this.agentDir(m.agentId);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(this.filePath(m.agentId, m.period), JSON.stringify(m, null, 2));
    }
    this.dirty.clear();
  }

  /** Get metrics for a specific day (loads from disk if needed) */
  getDaily(agentId: string, date: string): CttMetrics | null {
    const path = this.filePath(agentId, date);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as CttMetrics;
    } catch {
      return null;
    }
  }

  /** Get aggregated metrics for a date range (inclusive) */
  getRange(agentId: string, fromDate: string, toDate: string): CttMetrics {
    const agg = emptyMetrics(agentId, `${fromDate}..${toDate}`);
    const allQueries = new Set<string>();
    const current = new Date(fromDate);
    const end = new Date(toDate);

    while (current <= end) {
      const date = current.toISOString().slice(0, 10);
      const daily = this.getDaily(agentId, date);
      if (daily) {
        agg.recallCalls += daily.recallCalls;
        agg.recallHits += daily.recallHits;
        agg.totalItemsReturned += daily.totalItemsReturned;
        agg.totalTopScore += daily.totalTopScore;
        agg.correctionsApplied += daily.correctionsApplied;
        agg.miningExtractions += daily.miningExtractions;
        for (const q of daily.uniqueQueries) allQueries.add(q);
      }
      current.setDate(current.getDate() + 1);
    }

    agg.uniqueQueries = [...allQueries].slice(0, MAX_UNIQUE_QUERIES);
    return agg;
  }

  /** Get trend data as daily array for the last N days */
  getTrend(agentId: string, days: number): CttMetrics[] {
    const result: CttMetrics[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      const daily = this.getDaily(agentId, date);
      result.push(daily ?? emptyMetrics(agentId, date));
    }
    return result;
  }

  /** Computed summary from aggregated metrics */
  static summary(m: CttMetrics): {
    hitRate: number;
    avgItemsPerRecall: number;
    avgTopScore: number;
    uniqueQueryCount: number;
  } {
    return {
      hitRate: m.recallCalls > 0 ? m.recallHits / m.recallCalls : 0,
      avgItemsPerRecall: m.recallCalls > 0 ? m.totalItemsReturned / m.recallCalls : 0,
      avgTopScore: m.recallCalls > 0 ? m.totalTopScore / m.recallCalls : 0,
      uniqueQueryCount: m.uniqueQueries.length,
    };
  }
}
