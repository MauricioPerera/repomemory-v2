/**
 * A2E workflow skill management — save, recall, and mine workflow patterns.
 *
 * Integrates A2E workflow execution results with RepoMemory's memory system:
 * - Successful workflows are saved as reusable skills (category: correction-free fact)
 * - Failed workflows are saved as corrections (CTT boost prevents re-use)
 * - API knowledge is extracted from successful ApiCall operations
 * - Workflow patterns are mined from session transcripts
 *
 * Reference: A2E Protocol Specification v1.0.0
 * https://github.com/MauricioPerera/a2e
 */

import type { RepoMemory } from '../index.js';
import type { FewShotExample } from '../types/results.js';
import { sanitizeSecrets } from './sanitize.js';

/**
 * Save a successful A2E workflow as a reusable memory.
 * The saved pattern format "Para <query>: [A2E: <tag>]" enables
 * few-shot extraction by RecallEngine.
 *
 * @param repo - RepoMemory instance
 * @param agentId - Agent scope
 * @param userId - User scope
 * @param rawTag - The A2E tag content (e.g., "ApiCall GET https://...")
 * @param userQuery - The user's original query that triggered the workflow
 * @param secrets - Optional secrets map for sanitization before saving
 * @param extraTags - Additional tags to attach
 */
export function saveWorkflowSkill(
  repo: RepoMemory,
  agentId: string,
  userId: string,
  rawTag: string,
  userQuery: string,
  secrets: Record<string, string> = {},
  extraTags: string[] = [],
): void {
  const sanitizedTag = sanitizeSecrets(rawTag.trim(), secrets);
  const shortQuery = userQuery.slice(0, 100);
  const content = `Para ${shortQuery}: [A2E: ${sanitizedTag}]`;

  const opTags = extractOperationTags(rawTag);

  repo.memories.saveOrUpdate(agentId, userId, {
    content,
    category: 'fact',
    tags: ['a2e', 'workflow', ...opTags, ...extraTags],
  });
}

/**
 * Save a failed A2E workflow as a correction memory.
 * Tagged as 'correction' category so RepoMemory's correctionBoost (2x)
 * makes it surface above normal memories — warning agents not to repeat
 * the same pattern.
 *
 * @param repo - RepoMemory instance
 * @param agentId - Agent scope
 * @param userId - User scope
 * @param rawTag - The failed A2E tag content
 * @param errorMsg - Error message from execution
 * @param userQuery - The user's original query
 * @param secrets - Optional secrets map for sanitization
 */
export function saveWorkflowError(
  repo: RepoMemory,
  agentId: string,
  userId: string,
  rawTag: string,
  errorMsg: string,
  userQuery: string,
  secrets: Record<string, string> = {},
): void {
  const sanitizedTag = sanitizeSecrets(rawTag.trim(), secrets);
  const shortQuery = userQuery.slice(0, 100);
  const content = `Error al ejecutar [A2E: ${sanitizedTag}] para "${shortQuery}": ${errorMsg}. No usar este patron.`;

  repo.memories.saveOrUpdate(agentId, userId, {
    content,
    category: 'correction',
    tags: ['a2e', 'a2e-error', 'correction'],
  });
}

/**
 * Extract API knowledge from a successful ApiCall.
 * Saves the base URL, method, and response field names as a fact memory
 * so future queries about this API can recall how to use it.
 *
 * @param repo - RepoMemory instance
 * @param agentId - Agent scope
 * @param userId - User scope
 * @param rawTag - The ApiCall tag content (e.g., "ApiCall GET https://...")
 * @param result - The execution result (used to extract response field names)
 * @param secrets - Optional secrets map for sanitization
 */
export function extractApiKnowledge(
  repo: RepoMemory,
  agentId: string,
  userId: string,
  rawTag: string,
  result: string,
  secrets: Record<string, string> = {},
): void {
  const sanitizedTag = sanitizeSecrets(rawTag.trim(), secrets);
  if (!sanitizedTag.startsWith('ApiCall')) return;

  const parts = sanitizedTag.split(/\s+/);
  const method = parts[1] || 'GET';
  const urlStr = parts[2] || '';
  if (!urlStr) return;

  try {
    const parsed = new URL(urlStr);
    const baseUrl = `${parsed.protocol}//${parsed.host}`;

    // Try to extract top-level fields from response
    let responseFields = '';
    try {
      const resultJson = JSON.parse(result);
      const firstResult = typeof resultJson === 'object' && resultJson !== null
        ? Object.values(resultJson)[0] as Record<string, unknown>
        : null;
      const data = (firstResult as Record<string, unknown>)?.data ?? firstResult;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const keys = Object.keys(data as object).slice(0, 10);
        if (keys.length > 0) responseFields = ` Campos: ${keys.join(', ')}.`;
      }
    } catch { /* not JSON */ }

    const content = `API disponible: ${method} ${baseUrl}${parsed.pathname}.${responseFields} Usar: [A2E: ApiCall ${method} ${urlStr}]`;

    repo.memories.saveOrUpdate(agentId, userId, {
      content,
      category: 'fact',
      tags: ['a2e', 'a2e-skill', 'api', parsed.host.replace(/\./g, '-')],
    });
  } catch { /* invalid URL */ }
}

/**
 * Recall A2E workflow skills matching a query.
 * Searches memories for entries tagged with 'a2e' and returns
 * workflow patterns that match the query semantically.
 *
 * @param repo - RepoMemory instance
 * @param agentId - Agent scope
 * @param userId - User scope
 * @param query - Search query
 * @param limit - Max results (default: 3)
 * @returns Array of workflow content strings
 */
export function recallWorkflows(
  repo: RepoMemory,
  agentId: string,
  userId: string,
  query: string,
  limit = 3,
): string[] {
  const results = repo.memories.search(agentId, userId, query, limit * 3);
  return results
    .filter(r =>
      r.entity.tags.includes('a2e') &&
      (r.entity.tags.includes('workflow') || r.entity.tags.includes('a2e-skill')) &&
      r.entity.category !== 'correction',
    )
    .slice(0, limit)
    .map(r => r.entity.content);
}

/**
 * Parse a workflow skill content string into a FewShotExample.
 * Expected format: "Para <question>: [A2E: <tag>]"
 *
 * @returns FewShotExample or null if content doesn't match the pattern
 */
export function parseWorkflowSkill(content: string): FewShotExample | null {
  const match = content.match(/^Para (.+?):\s*(\[A2E:\s*[\s\S]+\])$/);
  if (!match) return null;
  return { user: match[1], assistant: match[2] };
}

/**
 * Mine A2E workflow patterns from session content.
 * Deterministic extraction (no AI needed) — finds [A2E: ...] tags
 * in session text and associates them with preceding user messages.
 *
 * @param repo - RepoMemory instance
 * @param agentId - Agent scope
 * @param userId - User scope
 * @param sessionContent - Raw session text (role: content format)
 * @param secrets - Optional secrets map for sanitization
 * @returns Number of patterns extracted and saved
 */
export function mineA2ePatterns(
  repo: RepoMemory,
  agentId: string,
  userId: string,
  sessionContent: string,
  secrets: Record<string, string> = {},
): number {
  let saved = 0;
  const lines = sessionContent.split('\n');

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const tagMatch = line.match(/\[A2E:\s*([\s\S]*?)\]/);
    if (!tagMatch) continue;

    const tagContent = tagMatch[1].trim();
    if (!tagContent) continue;

    // Skip error results
    if (line.includes('[error:')) continue;

    // Look backwards for a user: line to get the query
    let userQuery = '';
    for (let i = idx - 1; i >= 0; i--) {
      if (lines[i].startsWith('user:')) {
        userQuery = lines[i].replace(/^user:\s*/, '').trim();
        break;
      }
    }

    if (userQuery) {
      const sanitizedTag = sanitizeSecrets(tagContent, secrets);
      const content = `Para ${userQuery.slice(0, 100)}: [A2E: ${sanitizedTag}]`;
      repo.memories.saveOrUpdate(agentId, userId, {
        content,
        category: 'fact',
        tags: ['a2e', 'workflow', 'mined'],
      });
      saved++;
    }
  }

  return saved;
}

/**
 * Extract operation type tags from a raw A2E tag string.
 * Used for tagging saved workflow skills.
 *
 * @returns Array of lowercase operation type names (e.g., ['apicall', 'filterdata'])
 */
function extractOperationTags(rawTag: string): string[] {
  const firstToken = rawTag.trim().split(/\s+/)[0];
  if (!firstToken) return [];

  // Multi-op JSONL workflows
  if (firstToken.startsWith('{')) {
    const types: string[] = [];
    for (const line of rawTag.split('\n')) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'operationUpdate' && parsed.operation) {
          types.push(...Object.keys(parsed.operation).map(t => t.toLowerCase()));
        }
      } catch { /* not JSON */ }
    }
    return types;
  }

  return [firstToken.toLowerCase()];
}
