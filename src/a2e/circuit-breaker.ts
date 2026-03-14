/**
 * A2E circuit breaker — prevents repeated calls to failing API hosts.
 *
 * Queries RepoMemory for recent `a2e-error` entries matching a host.
 * If the error count meets or exceeds the threshold, the circuit is open
 * and the caller should skip execution.
 *
 * This uses RepoMemory's existing TF-IDF search + correction boost scoring.
 * Errors saved with category 'correction' naturally score higher due to
 * RepoMemory's correctionBoost (2x), making recent errors more visible.
 *
 * Reference: A2E Protocol Specification v1.0.0
 * https://github.com/MauricioPerera/a2e
 */

import type { RepoMemory } from '../index.js';

const DEFAULT_THRESHOLD = 3;

export interface CircuitBreakerResult {
  /** Whether the circuit is open (should block execution) */
  open: boolean;
  /** Number of errors found for this host */
  errorCount: number;
  /** The host that was checked */
  host: string;
  /** Human-readable message */
  message: string;
}

/**
 * Extract a hostname from an A2E workflow tag or URL string.
 * Returns null if no URL is found.
 */
export function extractHost(text: string): string | null {
  const match = text.match(/https?:\/\/([^/\s?]+)/);
  return match ? match[1] : null;
}

/**
 * Check whether an API host has too many recent errors in memory.
 *
 * @param repo - RepoMemory instance
 * @param agentId - Agent scope
 * @param userId - User scope
 * @param host - Hostname to check (e.g., "api.example.com")
 * @param threshold - Number of errors that triggers the circuit breaker (default: 3)
 * @returns CircuitBreakerResult with open/closed status
 */
export function checkCircuitBreaker(
  repo: RepoMemory,
  agentId: string,
  userId: string,
  host: string,
  threshold = DEFAULT_THRESHOLD,
): CircuitBreakerResult {
  // Search memories for errors mentioning this host
  const results = repo.memories.search(agentId, userId, host, threshold * 3);
  const errors = results.filter(r => r.entity.category === 'correction' && r.entity.tags.includes('a2e-error'));

  const open = errors.length >= threshold;

  return {
    open,
    errorCount: errors.length,
    host,
    message: open
      ? `Circuit breaker open — ${host} has ${errors.length} recent errors. Use a different endpoint or retry later.`
      : `Circuit OK — ${host} has ${errors.length} error(s), below threshold of ${threshold}.`,
  };
}

/**
 * Check circuit breaker from a raw A2E tag string.
 * Extracts the host automatically. Returns null if no URL is found (non-HTTP operations).
 */
export function checkCircuitBreakerFromTag(
  repo: RepoMemory,
  agentId: string,
  userId: string,
  rawTag: string,
  threshold = DEFAULT_THRESHOLD,
): CircuitBreakerResult | null {
  const host = extractHost(rawTag);
  if (!host) return null;
  return checkCircuitBreaker(repo, agentId, userId, host, threshold);
}
