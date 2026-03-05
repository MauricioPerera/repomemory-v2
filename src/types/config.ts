import type { AiProvider } from './ai.js';

export interface RepoMemoryConfig {
  dir: string;
  ai?: AiProvider;
  dedupThreshold?: number;
  maxSessionTokens?: number;
  lockEnabled?: boolean;
}
