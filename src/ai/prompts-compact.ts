/**
 * Compact prompts optimized for small/reasoning models (e.g., qwen3.5:0.8b).
 *
 * Design decisions:
 * - Short system prompts to save context window
 * - One-shot examples as user/assistant turns (few-shot grounding)
 * - Explicit schema with no ambiguity
 * - No verbose guidelines — the example IS the guideline
 */
import type { AiMessage } from '../types/ai.js';

// ─── MINING ──────────────────────────────────────────────────────────

const MINING_SYSTEM_COMPACT = `JSON extraction tool. Read conversation, output ONLY valid JSON following the exact schema.

Memory categories: fact, decision, issue, task
Skill categories: procedure, configuration, troubleshooting, workflow
Rules: output ONLY JSON. content=one sentence. tags=1-3 lowercase words. profile=null if unclear. Empty array [] if none found.`;

const MINING_EXAMPLE_USER = `Extract:
User: We use React 18 with TypeScript.
Assistant: Tailwind CSS configured. To deploy run npm build then docker compose up.
User: We decided to use PostgreSQL.
Assistant: Database connection pool set to 20.`;

const MINING_EXAMPLE_ASSISTANT = `{"memories":[{"content":"The project uses React 18 with TypeScript","tags":["react","typescript"],"category":"fact"},{"content":"Tailwind CSS was configured for styling","tags":["tailwind","css"],"category":"fact"},{"content":"Team decided to use PostgreSQL as database","tags":["postgresql","database"],"category":"decision"},{"content":"Database connection pool configured to 20","tags":["database","pool"],"category":"fact"}],"skills":[{"content":"To deploy: run npm build then docker compose up","tags":["deploy","docker"],"category":"procedure"}],"profile":null}`;

export function buildMiningMessages(sessionContent: string): AiMessage[] {
  // Truncate very long sessions to fit in small model context window
  const maxChars = 2000;
  const truncated = sessionContent.length > maxChars
    ? sessionContent.slice(-maxChars)
    : sessionContent;

  return [
    { role: 'system', content: MINING_SYSTEM_COMPACT },
    { role: 'user', content: MINING_EXAMPLE_USER },
    { role: 'assistant', content: MINING_EXAMPLE_ASSISTANT },
    { role: 'user', content: `Extract:\n${truncated}` },
  ];
}

// ─── CONSOLIDATION (memories) ────────────────────────────────────────

const CONSOLIDATION_SYSTEM_COMPACT = `Memory consolidation tool. Given memories, decide: keep unique ones, merge duplicates, remove outdated ones. Output ONLY JSON.

Every ID from the input must appear in exactly ONE of: keep, merge.sourceIds, or remove. Use ONLY IDs from the input.`;

const CONSOLIDATION_EXAMPLE_USER = `Consolidate:
{"id":"m-1","content":"Project uses PostgreSQL 15","tags":["db"],"category":"fact"}
{"id":"m-2","content":"Database is PostgreSQL version 15","tags":["database"],"category":"fact"}
{"id":"m-3","content":"JWT auth is used","tags":["auth"],"category":"decision"}`;

const CONSOLIDATION_EXAMPLE_ASSISTANT = `{"keep":["m-3"],"merge":[{"sourceIds":["m-1","m-2"],"merged":{"content":"Project uses PostgreSQL 15","tags":["database","postgresql"],"category":"fact"}}],"remove":[]}`;

export function buildConsolidationMessages(memoriesJson: string): AiMessage[] {
  return [
    { role: 'system', content: CONSOLIDATION_SYSTEM_COMPACT },
    { role: 'user', content: CONSOLIDATION_EXAMPLE_USER },
    { role: 'assistant', content: CONSOLIDATION_EXAMPLE_ASSISTANT },
    { role: 'user', content: `Consolidate:\n${memoriesJson}` },
  ];
}

// ─── SKILL CONSOLIDATION ────────────────────────────────────────────

const SKILL_CONSOLIDATION_SYSTEM_COMPACT = `Skill consolidation tool. Given skills, decide: keep unique ones, merge duplicates, remove outdated ones. Output ONLY JSON.

Every ID from the input must appear in exactly ONE of: keep, merge.sourceIds, or remove. Use ONLY IDs from the input.`;

const SKILL_CONSOLIDATION_EXAMPLE_USER = `Consolidate:
{"id":"s-1","content":"Deploy with docker compose up -d","tags":["deploy"],"category":"procedure"}
{"id":"s-2","content":"To deploy run docker compose up -d in server dir","tags":["deploy","docker"],"category":"procedure"}
{"id":"s-3","content":"Configure ESLint with strict rules","tags":["eslint","config"],"category":"configuration"}`;

const SKILL_CONSOLIDATION_EXAMPLE_ASSISTANT = `{"keep":["s-3"],"merge":[{"sourceIds":["s-1","s-2"],"merged":{"content":"To deploy: run docker compose up -d in the server directory","tags":["deploy","docker"],"category":"procedure"}}],"remove":[]}`;

export function buildSkillConsolidationMessages(skillsJson: string): AiMessage[] {
  return [
    { role: 'system', content: SKILL_CONSOLIDATION_SYSTEM_COMPACT },
    { role: 'user', content: SKILL_CONSOLIDATION_EXAMPLE_USER },
    { role: 'assistant', content: SKILL_CONSOLIDATION_EXAMPLE_ASSISTANT },
    { role: 'user', content: `Consolidate:\n${skillsJson}` },
  ];
}

// ─── KNOWLEDGE CONSOLIDATION ─────────────────────────────────────────

const KNOWLEDGE_CONSOLIDATION_SYSTEM_COMPACT = `Knowledge consolidation tool. Given knowledge entries, decide: keep unique ones, merge duplicates, remove outdated ones. Output ONLY JSON.

Every ID from the input must appear in exactly ONE of: keep, merge.sourceIds, or remove. Use ONLY IDs from the input.`;

const KNOWLEDGE_CONSOLIDATION_EXAMPLE_USER = `Consolidate:
{"id":"k-1","content":"REST API supports pagination via cursor tokens","tags":["api","pagination"]}
{"id":"k-2","content":"API pagination uses cursor-based tokens with after parameter","tags":["api","pagination"]}
{"id":"k-3","content":"Rate limit is 100 req/min per API key","tags":["api","rate-limit"]}`;

const KNOWLEDGE_CONSOLIDATION_EXAMPLE_ASSISTANT = `{"keep":["k-3"],"merge":[{"sourceIds":["k-1","k-2"],"merged":{"content":"REST API supports cursor-based pagination using the after parameter","tags":["api","pagination"]}}],"remove":[]}`;

export function buildKnowledgeConsolidationMessages(knowledgeJson: string): AiMessage[] {
  return [
    { role: 'system', content: KNOWLEDGE_CONSOLIDATION_SYSTEM_COMPACT },
    { role: 'user', content: KNOWLEDGE_CONSOLIDATION_EXAMPLE_USER },
    { role: 'assistant', content: KNOWLEDGE_CONSOLIDATION_EXAMPLE_ASSISTANT },
    { role: 'user', content: `Consolidate:\n${knowledgeJson}` },
  ];
}
