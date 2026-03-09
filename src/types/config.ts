import type { AiProvider } from './ai.js';
import type { ScoringWeights } from '../search/scoring.js';
import type { NeuralConfig } from '../neural/types.js';

export interface RepoMemoryConfig {
  dir: string;
  ai?: AiProvider;
  dedupThreshold?: number;
  /** Maximum characters for session content passed to AI mining. Default: 100_000 */
  maxSessionChars?: number;
  lockEnabled?: boolean;
  /** Scoring weights for search ranking. Applied to all collections unless overridden. */
  scoring?: ScoringWeights;
  /** Automatically mine sessions when saved. Requires `ai` provider. Default: false */
  autoMine?: boolean;
  /** Use compact prompts optimized for small models (<3B params). Default: auto-detect (true for Ollama, false otherwise) */
  compactPrompts?: boolean;
  /** Neural embedding engine configuration. Requires @huggingface/transformers (optional peer dependency). */
  neural?: NeuralConfig;
}
