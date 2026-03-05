import type { AiProvider, AiMessage } from '../types/ai.js';
import { RepoMemoryError } from '../types/errors.js';
import { safeJsonParse } from '../serialization/json.js';
import {
  MINING_SYSTEM, MINING_USER,
  CONSOLIDATION_SYSTEM, CONSOLIDATION_USER,
  SKILL_CONSOLIDATION_SYSTEM, SKILL_CONSOLIDATION_USER,
  KNOWLEDGE_CONSOLIDATION_SYSTEM, KNOWLEDGE_CONSOLIDATION_USER,
} from './prompts.js';

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
    if (typeof mem.content !== 'string') return false;
    if (!Array.isArray(mem.tags)) return false;
    if (typeof mem.category !== 'string') return false;
  }
  for (const s of obj.skills) {
    if (typeof s !== 'object' || s === null) return false;
    const skill = s as Record<string, unknown>;
    if (typeof skill.content !== 'string') return false;
    if (!Array.isArray(skill.tags)) return false;
    if (typeof skill.category !== 'string') return false;
  }
  if (obj.profile !== undefined && obj.profile !== null) {
    if (typeof obj.profile !== 'object') return false;
    const p = obj.profile as Record<string, unknown>;
    if (typeof p.content !== 'string') return false;
    if (typeof p.metadata !== 'object' || p.metadata === null) return false;
  }
  return true;
}

function validateConsolidationPlan(data: unknown): data is ConsolidationPlan {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.keep)) return false;
  if (!Array.isArray(obj.merge)) return false;
  if (!Array.isArray(obj.remove)) return false;
  for (const m of obj.merge) {
    if (typeof m !== 'object' || m === null) return false;
    const merge = m as Record<string, unknown>;
    if (!Array.isArray(merge.sourceIds)) return false;
    if (typeof merge.merged !== 'object' || merge.merged === null) return false;
    const merged = merge.merged as Record<string, unknown>;
    if (typeof merged.content !== 'string') return false;
    if (!Array.isArray(merged.tags)) return false;
  }
  return true;
}

export class AiService {
  constructor(private readonly provider: AiProvider) {}

  async extractFromSession(sessionContent: string): Promise<MiningExtraction> {
    const messages: AiMessage[] = [
      { role: 'system', content: MINING_SYSTEM },
      { role: 'user', content: MINING_USER(sessionContent) },
    ];
    return this.parseJsonWithRetry<MiningExtraction>(messages, validateMiningExtraction);
  }

  async planConsolidation(memoriesJson: string): Promise<ConsolidationPlan> {
    const messages: AiMessage[] = [
      { role: 'system', content: CONSOLIDATION_SYSTEM },
      { role: 'user', content: CONSOLIDATION_USER(memoriesJson) },
    ];
    return this.parseJsonWithRetry<ConsolidationPlan>(messages, validateConsolidationPlan);
  }

  async planSkillConsolidation(skillsJson: string): Promise<ConsolidationPlan> {
    const messages: AiMessage[] = [
      { role: 'system', content: SKILL_CONSOLIDATION_SYSTEM },
      { role: 'user', content: SKILL_CONSOLIDATION_USER(skillsJson) },
    ];
    return this.parseJsonWithRetry<ConsolidationPlan>(messages, validateConsolidationPlan);
  }

  async planKnowledgeConsolidation(knowledgeJson: string): Promise<ConsolidationPlan> {
    const messages: AiMessage[] = [
      { role: 'system', content: KNOWLEDGE_CONSOLIDATION_SYSTEM },
      { role: 'user', content: KNOWLEDGE_CONSOLIDATION_USER(knowledgeJson) },
    ];
    return this.parseJsonWithRetry<ConsolidationPlan>(messages, validateConsolidationPlan);
  }

  private async parseJsonWithRetry<T>(
    messages: AiMessage[],
    validator?: (data: unknown) => data is T,
  ): Promise<T> {
    const response = await this.provider.chat(messages);
    const raw = this.extractJsonString(response);
    try {
      const parsed = safeJsonParse<T>(raw);
      if (validator && !validator(parsed)) {
        throw new Error('Response schema validation failed');
      }
      return parsed;
    } catch (e) {
      const errorDetail = e instanceof Error ? e.message : 'Invalid JSON';
      const retryMessages: AiMessage[] = [
        ...messages,
        { role: 'assistant', content: response },
        {
          role: 'user',
          content: `Your response contained invalid or malformed JSON. Error: ${errorDetail}\n\nPlease fix and respond with ONLY valid JSON, no markdown, no explanation.`,
        },
      ];
      const retryResponse = await this.provider.chat(retryMessages);
      const retryRaw = this.extractJsonString(retryResponse);
      try {
        const parsed = safeJsonParse<T>(retryRaw);
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
