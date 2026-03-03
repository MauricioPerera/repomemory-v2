import type { AiProvider, AiMessage } from '../types/ai.js';
import { RepoMemoryError } from '../types/errors.js';
import { safeJsonParse } from '../serialization/json.js';
import { MINING_SYSTEM, MINING_USER, CONSOLIDATION_SYSTEM, CONSOLIDATION_USER } from './prompts.js';

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
    const response = await this.provider.chat(messages);
    return this.parseJson<MiningExtraction>(response);
  }

  async planConsolidation(memoriesJson: string): Promise<ConsolidationPlan> {
    const messages: AiMessage[] = [
      { role: 'system', content: CONSOLIDATION_SYSTEM },
      { role: 'user', content: CONSOLIDATION_USER(memoriesJson) },
    ];
    const response = await this.provider.chat(messages);
    return this.parseJson<ConsolidationPlan>(response);
  }

  private parseJson<T>(text: string): T {
    // Extract JSON from potential markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = jsonMatch ? jsonMatch[1].trim() : text.trim();
    try {
      return safeJsonParse<T>(raw);
    } catch {
      throw new RepoMemoryError('AI_ERROR', `Failed to parse AI response as JSON: ${text.slice(0, 200)}`);
    }
  }
}
