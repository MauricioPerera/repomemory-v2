import type { Entity, Memory, Skill, Knowledge, Profile } from './entities.js';

export interface SearchResult<T extends Entity = Entity> {
  entity: T;
  score: number;
}

export interface MiningResult {
  sessionId: string;
  memories: Memory[];
  skills: Skill[];
  profile?: Profile;
}

export interface ConsolidationReport {
  agentId: string;
  userId: string;
  merged: number;
  removed: number;
  kept: number;
}

export interface SkillConsolidationReport {
  agentId: string;
  merged: number;
  removed: number;
  kept: number;
}

export interface KnowledgeConsolidationReport {
  agentId: string;
  merged: number;
  removed: number;
  kept: number;
}

export interface CommitInfo {
  hash: string;
  parent: string | null;
  objectHash: string;
  timestamp: string;
  author: string;
  message: string;
}

export interface RefInfo {
  head: string;
  created: string;
}

export interface SnapshotInfo {
  id: string;
  label: string;
  timestamp: string;
  refCount: number;
}

export interface VerifyResult {
  valid: boolean;
  totalObjects: number;
  totalCommits: number;
  errors: string[];
}

export interface ListOptions {
  limit?: number;
  offset?: number;
}

export interface ListResult<T extends Entity> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface RecallOptions {
  maxItems?: number;
  maxChars?: number;
  includeSharedSkills?: boolean;
  includeSharedKnowledge?: boolean;
  includeProfile?: boolean;
  collections?: Array<'memories' | 'skills' | 'knowledge'>;
  /** Prompt template ID (built-in) or custom PromptTemplate object.
   *  Controls section order, headers, collection weights, and preamble. */
  template?: string | import('../recall/templates.js').PromptTemplate;
}

export interface FewShotExample {
  /** Derived user question */
  user: string;
  /** Skill content containing the pattern to imitate */
  assistant: string;
}

export interface RecallContext {
  memories: Array<SearchResult<Memory>>;
  skills: Array<SearchResult<Skill>>;
  knowledge: Array<SearchResult<Knowledge>>;
  profile: Profile | null;
  formatted: string;
  totalItems: number;
  estimatedChars: number;
  /** Few-shot examples extracted from recalled skills (for sub-1B model prompting) */
  fewShotExamples?: FewShotExample[];
}
