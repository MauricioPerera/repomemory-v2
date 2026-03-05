import type { AiProvider } from './ai.js';

export interface RepoMemoryConfig {
  dir: string;
  ai?: AiProvider;
  dedupThreshold?: number;
  /** Maximum characters for session content passed to AI mining. Default: 100_000 */
  maxSessionChars?: number;
  lockEnabled?: boolean;
}
