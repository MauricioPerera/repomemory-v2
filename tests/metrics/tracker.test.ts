import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MetricsTracker } from '../../src/metrics/tracker.js';

describe('MetricsTracker', () => {
  let dir: string;
  let tracker: MetricsTracker;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'repomem-metrics-'));
    tracker = new MetricsTracker(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('tracks recall calls', () => {
    tracker.trackRecall('agent1', 'test query', 5, 0.85);
    tracker.trackRecall('agent1', 'another query', 3, 0.72);
    tracker.flush();

    const today = new Date().toISOString().slice(0, 10);
    const daily = tracker.getDaily('agent1', today);
    expect(daily).not.toBeNull();
    expect(daily!.recallCalls).toBe(2);
    expect(daily!.recallHits).toBe(2);
    expect(daily!.totalItemsReturned).toBe(8);
    expect(daily!.totalTopScore).toBeCloseTo(1.57, 1);
    expect(daily!.uniqueQueries).toContain('test query');
    expect(daily!.uniqueQueries).toContain('another query');
  });

  it('tracks recall with zero items as miss', () => {
    tracker.trackRecall('agent1', 'empty query', 0, 0);
    tracker.flush();

    const today = new Date().toISOString().slice(0, 10);
    const daily = tracker.getDaily('agent1', today);
    expect(daily!.recallCalls).toBe(1);
    expect(daily!.recallHits).toBe(0);
  });

  it('tracks corrections', () => {
    tracker.trackCorrection('agent1');
    tracker.trackCorrection('agent1');
    tracker.flush();

    const today = new Date().toISOString().slice(0, 10);
    const daily = tracker.getDaily('agent1', today);
    expect(daily!.correctionsApplied).toBe(2);
  });

  it('tracks mining extractions', () => {
    tracker.trackMining('agent1');
    tracker.flush();

    const today = new Date().toISOString().slice(0, 10);
    const daily = tracker.getDaily('agent1', today);
    expect(daily!.miningExtractions).toBe(1);
  });

  it('computes correct summary', () => {
    tracker.trackRecall('agent1', 'q1', 10, 0.9);
    tracker.trackRecall('agent1', 'q2', 0, 0);
    tracker.trackRecall('agent1', 'q3', 5, 0.7);
    tracker.flush();

    const today = new Date().toISOString().slice(0, 10);
    const daily = tracker.getDaily('agent1', today)!;
    const summary = MetricsTracker.summary(daily);

    expect(summary.hitRate).toBeCloseTo(2 / 3, 2);
    expect(summary.avgItemsPerRecall).toBeCloseTo(15 / 3, 2);
    expect(summary.avgTopScore).toBeCloseTo(1.6 / 3, 2);
    expect(summary.uniqueQueryCount).toBe(3);
  });

  it('returns null for non-existent day', () => {
    const result = tracker.getDaily('agent1', '2020-01-01');
    expect(result).toBeNull();
  });

  it('getTrend returns empty metrics for days without data', () => {
    const trend = tracker.getTrend('agent1', 3);
    expect(trend).toHaveLength(3);
    expect(trend[0].recallCalls).toBe(0);
    expect(trend[1].recallCalls).toBe(0);
    expect(trend[2].recallCalls).toBe(0);
  });

  it('deduplicates unique queries', () => {
    tracker.trackRecall('agent1', 'same query', 5, 0.8);
    tracker.trackRecall('agent1', 'same query', 3, 0.7);
    tracker.trackRecall('agent1', 'different query', 2, 0.5);
    tracker.flush();

    const today = new Date().toISOString().slice(0, 10);
    const daily = tracker.getDaily('agent1', today)!;
    expect(daily.uniqueQueries).toHaveLength(2);
  });

  it('isolates metrics per agent', () => {
    tracker.trackRecall('agent1', 'q1', 5, 0.8);
    tracker.trackRecall('agent2', 'q2', 3, 0.6);
    tracker.flush();

    const today = new Date().toISOString().slice(0, 10);
    const a1 = tracker.getDaily('agent1', today)!;
    const a2 = tracker.getDaily('agent2', today)!;
    expect(a1.recallCalls).toBe(1);
    expect(a2.recallCalls).toBe(1);
  });
});
