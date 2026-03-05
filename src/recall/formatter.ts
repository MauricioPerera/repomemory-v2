import type { Entity, Memory, Skill, Knowledge, Profile } from '../types/entities.js';
import type { SearchResult } from '../types/results.js';

export interface RecallData {
  memories: SearchResult<Memory>[];
  skills: SearchResult<Skill>[];
  knowledge: SearchResult<Knowledge>[];
  profile: Profile | null;
}

/**
 * Format recall context into a structured string suitable for LLM system prompts.
 * Priority: Profile > Memories > Skills > Knowledge
 * Truncates per section (never cuts an item in half) to respect maxChars budget.
 */
export function formatRecallContext(data: RecallData, maxChars: number): string {
  const sections: string[] = [];
  let remaining = maxChars;

  // 1. Profile first — essential framing
  if (data.profile) {
    const profileSection = formatProfile(data.profile);
    if (profileSection.length <= remaining) {
      sections.push(profileSection);
      remaining -= profileSection.length;
    }
  }

  // 2. Memories — facts, decisions, issues, tasks
  if (data.memories.length > 0 && remaining > 100) {
    const memorySection = formatSection(
      '## Relevant Memories',
      data.memories,
      remaining,
      formatMemoryItem,
    );
    if (memorySection) {
      sections.push(memorySection);
      remaining -= memorySection.length;
    }
  }

  // 3. Skills — procedures, configurations
  if (data.skills.length > 0 && remaining > 100) {
    const skillSection = formatSection(
      '## Relevant Skills',
      data.skills,
      remaining,
      formatSkillItem,
    );
    if (skillSection) {
      sections.push(skillSection);
      remaining -= skillSection.length;
    }
  }

  // 4. Knowledge — content, sources
  if (data.knowledge.length > 0 && remaining > 100) {
    const knowledgeSection = formatSection(
      '## Relevant Knowledge',
      data.knowledge,
      remaining,
      formatKnowledgeItem,
    );
    if (knowledgeSection) {
      sections.push(knowledgeSection);
      remaining -= knowledgeSection.length;
    }
  }

  return sections.join('\n\n');
}

function formatProfile(profile: Profile): string {
  const lines = ['## User Profile', profile.content];
  if (profile.metadata && Object.keys(profile.metadata).length > 0) {
    const meta = Object.entries(profile.metadata)
      .map(([k, v]) => `- ${k}: ${String(v)}`)
      .join('\n');
    lines.push(meta);
  }
  return lines.join('\n');
}

function formatSection<T extends Entity>(
  header: string,
  items: SearchResult<T>[],
  maxChars: number,
  formatItem: (item: T) => string,
): string | null {
  const headerLine = header + '\n';
  let budget = maxChars - headerLine.length;
  if (budget <= 0) return null;

  const formattedItems: string[] = [];
  for (const { entity } of items) {
    const line = formatItem(entity);
    if (line.length + 1 > budget) break; // +1 for newline
    formattedItems.push(line);
    budget -= line.length + 1;
  }

  if (formattedItems.length === 0) return null;
  return headerLine + formattedItems.join('\n');
}

function formatMemoryItem(m: Memory): string {
  const tags = m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : '';
  return `- [${m.category}]${tags} ${m.content}`;
}

function formatSkillItem(s: Skill): string {
  const tags = s.tags.length > 0 ? ` [${s.tags.join(', ')}]` : '';
  return `- [${s.category}]${tags} ${s.content}`;
}

function formatKnowledgeItem(k: Knowledge): string {
  const source = k.source ? ` (source: ${k.source})` : '';
  return `- ${k.content}${source}`;
}
