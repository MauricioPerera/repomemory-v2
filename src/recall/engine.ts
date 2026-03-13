import type { RepoMemory } from '../index.js';
import type { AccessTracker } from '../storage/access-tracker.js';
import type { Memory, Skill, Knowledge, Profile } from '../types/entities.js';
import type { SearchResult, RecallContext, RecallOptions, FewShotExample } from '../types/results.js';
import { formatRecallContext, formatWithTemplate } from './formatter.js';
import { resolveTemplate } from './templates.js';
import type { PromptTemplate } from './templates.js';

const DEFAULT_MAX_ITEMS = 20;
const DEFAULT_MAX_CHARS = 8_000;

export class RecallEngine {
  constructor(
    private readonly repo: RepoMemory,
    private readonly accessTracker?: AccessTracker,
  ) {}

  recall(agentId: string, userId: string, query: string, options?: RecallOptions): RecallContext {
    const maxItems = options?.maxItems ?? DEFAULT_MAX_ITEMS;
    const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
    const includeSharedSkills = options?.includeSharedSkills ?? true;
    const includeSharedKnowledge = options?.includeSharedKnowledge ?? true;
    const includeProfile = options?.includeProfile ?? true;
    const collections = options?.collections ?? ['memories', 'skills', 'knowledge'];

    // Resolve template (if provided)
    let template: PromptTemplate | undefined;
    if (options?.template) {
      template = resolveTemplate(options.template);
    }

    // Collection weight multipliers from template
    const memWeight = template?.collectionWeights?.memories ?? 1.0;
    const skillWeight = template?.collectionWeights?.skills ?? 1.0;
    const knowledgeWeight = template?.collectionWeights?.knowledge ?? 1.0;

    // Fetch generous candidates from each collection (2x budget)
    const fetchLimit = Math.max(10, maxItems * 2);

    type TaggedResult =
      | { source: 'memories'; result: SearchResult<Memory> }
      | { source: 'skills'; result: SearchResult<Skill> }
      | { source: 'knowledge'; result: SearchResult<Knowledge> };

    const pool: TaggedResult[] = [];

    if (collections.includes('memories')) {
      for (const r of this.repo.memories.search(agentId, userId, query, fetchLimit)) {
        pool.push({ source: 'memories', result: { entity: r.entity, score: r.score * memWeight } });
      }
    }

    if (collections.includes('skills')) {
      for (const r of this.repo.skills.search(agentId, query, fetchLimit, includeSharedSkills)) {
        pool.push({ source: 'skills', result: { entity: r.entity, score: r.score * skillWeight } });
      }
    }

    if (collections.includes('knowledge')) {
      for (const r of this.repo.knowledge.search(agentId, query, fetchLimit, includeSharedKnowledge)) {
        pool.push({ source: 'knowledge', result: { entity: r.entity, score: r.score * knowledgeWeight } });
      }
    }

    // Sort all candidates by score descending and take top maxItems
    pool.sort((a, b) => b.result.score - a.result.score);
    const selected = pool.slice(0, maxItems);

    // Distribute back to typed arrays
    const memories: SearchResult<Memory>[] = [];
    const skills: SearchResult<Skill>[] = [];
    const knowledge: SearchResult<Knowledge>[] = [];
    for (const item of selected) {
      if (item.source === 'memories') memories.push(item.result);
      else if (item.source === 'skills') skills.push(item.result);
      else knowledge.push(item.result);
    }

    let profile: Profile | null = null;
    if (includeProfile) {
      profile = this.repo.profiles.getByUser(agentId, userId);
    }

    // Track access for recalled items
    if (this.accessTracker) {
      const ids = selected.map(r => r.result.entity.id);
      if (ids.length > 0) {
        this.accessTracker.incrementMany(ids);
        this.accessTracker.flush();
      }
    }

    const totalItems = memories.length + skills.length + knowledge.length + (profile ? 1 : 0);
    const recallData = { memories, skills, knowledge, profile };

    // Use template-aware formatter if template provided, otherwise default
    const formatted = template
      ? formatWithTemplate(recallData, template, maxChars)
      : formatRecallContext(recallData, maxChars);
    const estimatedChars = formatted.length;

    // Extract few-shot examples from skills if template requests it
    let fewShotExamples: FewShotExample[] | undefined;
    if (template?.extractFewShot && skills.length > 0) {
      fewShotExamples = extractFewShotExamples(skills, template.maxFewShot ?? 3);
    }

    return {
      memories,
      skills,
      knowledge,
      profile,
      formatted,
      totalItems,
      estimatedChars,
      fewShotExamples,
    };
  }
}

/**
 * Extract few-shot conversation pairs from skill memories.
 * Skills containing tool-calling patterns (e.g., [MCP: ...], [CALC: ...], [FETCH: ...])
 * are converted to user question → assistant response pairs.
 *
 * This technique was developed in MicroExpert: sub-1B models learn tool usage
 * much better from demonstrated examples than from abstract instructions.
 */
function extractFewShotExamples(
  skills: SearchResult<Skill>[],
  maxExamples: number,
): FewShotExample[] {
  const examples: FewShotExample[] = [];
  const toolPattern = /\[(MCP|CALC|FETCH):\s/;

  for (const { entity } of skills) {
    if (examples.length >= maxExamples) break;
    if (!toolPattern.test(entity.content)) continue;

    // Derive a user question from the skill content
    const user = deriveQuestion(entity.content, entity.tags);
    if (!user) continue;

    examples.push({
      user,
      assistant: entity.content,
    });
  }

  return examples;
}

/** Derive a plausible user question from skill content and tags */
function deriveQuestion(content: string, tags: string[]): string | null {
  // Try to extract text before the tool tag as the question context
  const tagIdx = content.search(/\[(MCP|CALC|FETCH):\s/);
  if (tagIdx <= 0) {
    // No leading text — generate from tags
    if (tags.length > 0) {
      return `How do I ${tags.slice(0, 3).join(' ')}?`;
    }
    return null;
  }

  // Use text before the tag as the question (trim prefixes like "Para ", "To ", etc.)
  let question = content.slice(0, tagIdx).trim();
  // Remove common prefixes that make it a statement, not a question
  question = question.replace(/^(para |to |use |when |si |if )/i, '').trim();
  // Remove trailing colon/dash
  question = question.replace(/[:—–-]+\s*$/, '').trim();

  if (question.length < 5) {
    if (tags.length > 0) return `How do I ${tags.slice(0, 3).join(' ')}?`;
    return null;
  }

  // Ensure it ends with ? if it doesn't already
  if (!question.endsWith('?')) question += '?';
  return question;
}
