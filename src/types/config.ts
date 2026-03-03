import type { AiProvider } from './ai.js';
import type { EntityType } from './entities.js';

export interface RepoMemoryConfig {
  dir: string;
  ai?: AiProvider;
}

export interface SearchOptions {
  limit?: number;
  type?: EntityType;
  tags?: string[];
  category?: string;
  minScore?: number;
}
