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

export class AiService {
  constructor(private readonly provider: AiProvider) {}

  async extractFromSession(sessionContent: string): Promise<MiningExtraction> {
    const messages: AiMessage[] = [
      { role: 'system', content: MINING_SYSTEM },
      { role: 'user', content: MINING_USER(sessionContent) },
    ];
    return this.parseJsonWithRetry<MiningExtraction>(messages);
  }

  async planConsolidation(memoriesJson: string): Promise<ConsolidationPlan> {
    const messages: AiMessage[] = [
      { role: 'system', content: CONSOLIDATION_SYSTEM },
      { role: 'user', content: CONSOLIDATION_USER(memoriesJson) },
    ];
    return this.parseJsonWithRetry<ConsolidationPlan>(messages);
  }

  async planSkillConsolidation(skillsJson: string): Promise<ConsolidationPlan> {
    const messages: AiMessage[] = [
      { role: 'system', content: SKILL_CONSOLIDATION_SYSTEM },
      { role: 'user', content: SKILL_CONSOLIDATION_USER(skillsJson) },
    ];
    return this.parseJsonWithRetry<ConsolidationPlan>(messages);
  }

  async planKnowledgeConsolidation(knowledgeJson: string): Promise<ConsolidationPlan> {
    const messages: AiMessage[] = [
      { role: 'system', content: KNOWLEDGE_CONSOLIDATION_SYSTEM },
      { role: 'user', content: KNOWLEDGE_CONSOLIDATION_USER(knowledgeJson) },
    ];
    return this.parseJsonWithRetry<ConsolidationPlan>(messages);
  }

  private async parseJsonWithRetry<T>(messages: AiMessage[]): Promise<T> {
    const response = await this.provider.chat(messages);
    const raw = this.extractJsonString(response);
    try {
      return safeJsonParse<T>(raw);
    } catch {
      // Retry: send the broken response back asking for correction
      const retryMessages: AiMessage[] = [
        ...messages,
        { role: 'assistant', content: response },
        {
          role: 'user',
          content: `Your response contained invalid JSON. Here is your response:\n\n${response}\n\nPlease fix the JSON and respond with ONLY valid JSON, no markdown, no explanation.`,
        },
      ];
      const retryResponse = await this.provider.chat(retryMessages);
      const retryRaw = this.extractJsonString(retryResponse);
      try {
        return safeJsonParse<T>(retryRaw);
      } catch {
        throw new RepoMemoryError('AI_ERROR', `Failed to parse AI response as JSON after retry: ${retryResponse.slice(0, 200)}`);
      }
    }
  }

  private extractJsonString(text: string): string {
    // Try markdown code block first
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) return codeBlockMatch[1].trim();

    // Try to find JSON by matching braces/brackets
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
