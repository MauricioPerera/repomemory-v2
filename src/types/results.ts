import type { Entity, Memory, Skill, Profile } from './entities.js';

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
