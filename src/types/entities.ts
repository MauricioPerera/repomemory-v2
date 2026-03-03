export type MemoryCategory = 'fact' | 'decision' | 'issue' | 'task';
export type SkillCategory = 'procedure' | 'configuration' | 'troubleshooting' | 'workflow';
export type SkillStatus = 'active' | 'deprecated' | 'draft';

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Memory extends BaseEntity {
  type: 'memory';
  agentId: string;
  userId: string;
  content: string;
  tags: string[];
  category: MemoryCategory;
  sourceSession?: string;
  accessCount: number;
}

export interface Skill extends BaseEntity {
  type: 'skill';
  agentId: string;
  content: string;
  tags: string[];
  category: SkillCategory;
  status: SkillStatus;
  accessCount: number;
}

export interface Knowledge extends BaseEntity {
  type: 'knowledge';
  agentId: string;
  content: string;
  tags: string[];
  source?: string;
  chunkIndex?: number;
  version?: string;
  questions?: string[];
  accessCount: number;
}

export interface Session extends BaseEntity {
  type: 'session';
  agentId: string;
  userId: string;
  content: string;
  mined: boolean;
  startedAt: string;
  endedAt?: string;
}

export interface Profile extends BaseEntity {
  type: 'profile';
  agentId: string;
  userId: string;
  content: string;
  metadata: Record<string, unknown>;
}

export type Entity = Memory | Skill | Knowledge | Session | Profile;
export type EntityType = Entity['type'];

export interface SaveMemoryInput {
  content: string;
  tags?: string[];
  category?: MemoryCategory;
  sourceSession?: string;
}

export interface SaveSkillInput {
  content: string;
  tags?: string[];
  category?: SkillCategory;
  status?: SkillStatus;
}

export interface SaveKnowledgeInput {
  content: string;
  tags?: string[];
  source?: string;
  chunkIndex?: number;
  version?: string;
  questions?: string[];
}

export interface SaveSessionInput {
  content: string;
  startedAt?: string;
  endedAt?: string;
}

export interface SaveProfileInput {
  content: string;
  metadata?: Record<string, unknown>;
}
