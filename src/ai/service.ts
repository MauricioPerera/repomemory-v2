import type { AiProvider, AiMessage } from '../types/ai.js';
import { RepoMemoryError } from '../types/errors.js';
import { safeJsonParse } from '../serialization/json.js';
import {
  MINING_SYSTEM, MINING_USER,
  CONSOLIDATION_SYSTEM, CONSOLIDATION_USER,
  SKILL_CONSOLIDATION_SYSTEM, SKILL_CONSOLIDATION_USER,
  KNOWLEDGE_CONSOLIDATION_SYSTEM, KNOWLEDGE_CONSOLIDATION_USER,
} from './prompts.js';
import {
  buildMiningMessages,
  buildConsolidationMessages,
  buildSkillConsolidationMessages,
  buildKnowledgeConsolidationMessages,
} from './prompts-compact.js';
import { OllamaProvider } from './providers/ollama.js';

export interface MiningExtraction {
  memories: Array<{ content: string; tags: string[]; category: string }>;
  skills: Array<{ content: string; tags: string[]; category: string }>;
  profile?: { content: string; metadata: Record<string, unknown> };
}

export interface ConsolidationPlan {
  keep: string[];
  merge: Array<{ sourceIds: string[]; merged: { content: string; tags: string[]; category: string } }>;
  remove: string[];
}

function validateMiningExtraction(data: unknown): data is MiningExtraction {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.memories)) return false;
  if (!Array.isArray(obj.skills)) return false;
  for (const m of obj.memories) {
    if (typeof m !== 'object' || m === null) return false;
    const mem = m as Record<string, unknown>;
    if (typeof mem.content !== 'string' || mem.content.length === 0) return false;
    if (!Array.isArray(mem.tags) || !mem.tags.every((t: unknown) => typeof t === 'string')) return false;
    if (typeof mem.category !== 'string' || mem.category.length === 0) return false;
  }
  for (const s of obj.skills) {
    if (typeof s !== 'object' || s === null) return false;
    const skill = s as Record<string, unknown>;
    if (typeof skill.content !== 'string' || skill.content.length === 0) return false;
    if (!Array.isArray(skill.tags) || !skill.tags.every((t: unknown) => typeof t === 'string')) return false;
    if (typeof skill.category !== 'string' || skill.category.length === 0) return false;
  }
  if (obj.profile !== undefined && obj.profile !== null) {
    if (typeof obj.profile !== 'object') return false;
    const p = obj.profile as Record<string, unknown>;
    if (typeof p.content !== 'string' || p.content.length === 0) return false;
    if (typeof p.metadata !== 'object' || p.metadata === null) return false;
  }
  return true;
}

function validateConsolidationPlan(data: unknown): data is ConsolidationPlan {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.keep) || !obj.keep.every((k: unknown) => typeof k === 'string')) return false;
  if (!Array.isArray(obj.merge)) return false;
  if (!Array.isArray(obj.remove) || !obj.remove.every((r: unknown) => typeof r === 'string')) return false;
  for (const m of obj.merge) {
    if (typeof m !== 'object' || m === null) return false;
    const merge = m as Record<string, unknown>;
    if (!Array.isArray(merge.sourceIds) || !merge.sourceIds.every((s: unknown) => typeof s === 'string')) return false;
    if (merge.sourceIds.length === 0) return false;
    if (typeof merge.merged !== 'object' || merge.merged === null) return false;
    const merged = merge.merged as Record<string, unknown>;
    if (typeof merged.content !== 'string' || merged.content.length === 0) return false;
    if (!Array.isArray(merged.tags) || !merged.tags.every((t: unknown) => typeof t === 'string')) return false;
    if (typeof merged.category !== 'string' || merged.category.length === 0) return false;
  }
  return true;
}

export class AiService {
  private readonly useCompactPrompts: boolean;

  constructor(private readonly provider: AiProvider) {
    this.useCompactPrompts = provider instanceof OllamaProvider;
  }

  async extractFromSession(sessionContent: string): Promise<MiningExtraction> {
    const messages = this.useCompactPrompts
      ? buildMiningMessages(sessionContent)
      : [
          { role: 'system' as const, content: MINING_SYSTEM },
          { role: 'user' as const, content: MINING_USER(sessionContent) },
        ];
    return this.parseJsonWithRetry<MiningExtraction>(messages, validateMiningExtraction);
  }

  async planConsolidation(memoriesJson: string): Promise<ConsolidationPlan> {
    const messages = this.useCompactPrompts
      ? buildConsolidationMessages(memoriesJson)
      : [
          { role: 'system' as const, content: CONSOLIDATION_SYSTEM },
          { role: 'user' as const, content: CONSOLIDATION_USER(memoriesJson) },
        ];
    return this.parseJsonWithRetry<ConsolidationPlan>(messages, validateConsolidationPlan);
  }

  async planSkillConsolidation(skillsJson: string): Promise<ConsolidationPlan> {
    const messages = this.useCompactPrompts
      ? buildSkillConsolidationMessages(skillsJson)
      : [
          { role: 'system' as const, content: SKILL_CONSOLIDATION_SYSTEM },
          { role: 'user' as const, content: SKILL_CONSOLIDATION_USER(skillsJson) },
        ];
    return this.parseJsonWithRetry<ConsolidationPlan>(messages, validateConsolidationPlan);
  }

  async planKnowledgeConsolidation(knowledgeJson: string): Promise<ConsolidationPlan> {
    const messages = this.useCompactPrompts
      ? buildKnowledgeConsolidationMessages(knowledgeJson)
      : [
          { role: 'system' as const, content: KNOWLEDGE_CONSOLIDATION_SYSTEM },
          { role: 'user' as const, content: KNOWLEDGE_CONSOLIDATION_USER(knowledgeJson) },
        ];
    return this.parseJsonWithRetry<ConsolidationPlan>(messages, validateConsolidationPlan);
  }

  /**
   * Auto-fix common structural issues from small models:
   * - merge/keep/remove as single object instead of array
   * - missing keys with sensible defaults
   */
  private autoFixResponse(data: unknown): unknown {
    if (typeof data !== 'object' || data === null) return data;
    const obj = data as Record<string, unknown>;

    // Fix consolidation responses: wrap single merge object in array
    if ('merge' in obj && !Array.isArray(obj.merge) && typeof obj.merge === 'object' && obj.merge !== null) {
      obj.merge = [obj.merge];
    }
    // Ensure keep/remove are arrays
    if ('keep' in obj && !Array.isArray(obj.keep)) {
      obj.keep = obj.keep ? [obj.keep] : [];
    }
    if ('remove' in obj && !Array.isArray(obj.remove)) {
      obj.remove = obj.remove ? [obj.remove] : [];
    }
    // Ensure memories/skills are arrays (mining)
    if ('memories' in obj && !Array.isArray(obj.memories)) {
      obj.memories = obj.memories ? [obj.memories] : [];
    }
    if ('skills' in obj && !Array.isArray(obj.skills)) {
      obj.skills = obj.skills ? [obj.skills] : [];
    }
    return obj;
  }

  private async parseJsonWithRetry<T>(
    messages: AiMessage[],
    validator?: (data: unknown) => data is T,
  ): Promise<T> {
    const response = await this.provider.chat(messages);
    const raw = this.extractJsonString(response);
    try {
      let parsed = safeJsonParse<T>(raw);
      if (this.useCompactPrompts) {
        parsed = this.autoFixResponse(parsed) as T;
      }
      if (validator && !validator(parsed)) {
        throw new Error('Response schema validation failed');
      }
      return parsed;
    } catch (e) {
      const errorDetail = e instanceof Error ? e.message : 'Invalid JSON';
      const retryHint = this.useCompactPrompts
        ? `Invalid JSON. Error: ${errorDetail}\nRespond with ONLY a JSON object like: {"memories":[...],"skills":[],"profile":null}\nNo explanation, ONLY JSON.`
        : `Your response contained invalid or malformed JSON. Error: ${errorDetail}\n\nPlease fix and respond with ONLY valid JSON, no markdown, no explanation.`;
      const retryMessages: AiMessage[] = [
        ...messages,
        { role: 'assistant', content: response },
        { role: 'user', content: retryHint },
      ];
      const retryResponse = await this.provider.chat(retryMessages);
      const retryRaw = this.extractJsonString(retryResponse);
      try {
        let parsed = safeJsonParse<T>(retryRaw);
        if (this.useCompactPrompts) {
          parsed = this.autoFixResponse(parsed) as T;
        }
        if (validator && !validator(parsed)) {
          throw new Error('Response schema validation failed after retry');
        }
        return parsed;
      } catch {
        throw new RepoMemoryError('AI_ERROR', `Failed to parse AI response as JSON after retry: ${retryResponse.slice(0, 200)}`);
      }
    }
  }

  private extractJsonString(text: string): string {
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) return codeBlockMatch[1].trim();

    const trimmed = text.trim();
    const startChar = trimmed.indexOf('{') !== -1 && (trimmed.indexOf('[') === -1 || trimmed.indexOf('{') < trimmed.indexOf('['))
      ? '{'
      : '[';
    const startIdx = trimmed.indexOf(startChar);
    if (startIdx === -1) return trimmed;

    const closeChar = startChar === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = startIdx; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === startChar) depth++;
      else if (ch === closeChar) {
        depth--;
        if (depth === 0) return trimmed.slice(startIdx, i + 1);
      }
    }

    return trimmed;
  }
}
