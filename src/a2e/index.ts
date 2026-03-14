/**
 * A2E (Agent-to-Execution) integration module for RepoMemory.
 *
 * Provides:
 * - Workflow skill management (save, recall, mine patterns)
 * - Secret sanitization (resolve/sanitize {{VAR}} placeholders)
 * - Circuit breaker (error-based host blocking)
 * - A2E protocol knowledge (primitives documentation + workflow examples)
 *
 * Reference: A2E Protocol Specification v1.0.0
 * https://github.com/MauricioPerera/a2e
 */

export {
  sanitizeSecrets,
  resolveSecrets,
  SENSITIVE_PARAMS,
} from './sanitize.js';

export {
  checkCircuitBreaker,
  checkCircuitBreakerFromTag,
  extractHost,
  type CircuitBreakerResult,
} from './circuit-breaker.js';

export {
  saveWorkflowSkill,
  saveWorkflowError,
  extractApiKnowledge,
  recallWorkflows,
  parseWorkflowSkill,
  mineA2ePatterns,
} from './workflow-skills.js';

export { ingestA2EKnowledge } from './knowledge.js';
export type { IngestA2EKnowledgeResult } from './knowledge.js';

export { validateWorkflow, fixJsonl, normalizeResponse } from './validate.js';
export type { ValidationResult, ValidationError } from './validate.js';
