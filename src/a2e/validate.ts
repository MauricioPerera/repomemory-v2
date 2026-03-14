/**
 * A2E workflow validation — validates JSONL before execution.
 *
 * Three-stage pipeline:
 * 1. normalizeResponse: strips reasoning tags, collapses pretty-print, extracts from code blocks
 * 2. fixJsonl: fixes unquoted keys/values, trailing commas, truncated JSON
 * 3. validateWorkflow: validates structure, auto-synthesizes missing beginExecution
 *
 * Reference: A2E Protocol Specification v1.0.0
 * https://github.com/MauricioPerera/a2e
 */

const VALID_PRIMITIVES = new Set([
  'ApiCall', 'FilterData', 'TransformData', 'Conditional',
  'Loop', 'StoreData', 'Wait', 'MergeData',
]);

const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
const VALID_TRANSFORMS = new Set(['map', 'sort', 'group', 'aggregate', 'select']);
const VALID_STRATEGIES = new Set(['concat', 'union', 'intersect', 'deepMerge']);
const VALID_STORAGE = new Set(['localStorage', 'sessionStorage', 'file']);
const VALID_FILTER_OPS = new Set(['==', '!=', '>', '<', '>=', '<=', 'in', 'contains', 'startsWith', 'endsWith']);
const VALID_CONDITION_OPS = new Set(['==', '!=', '>', '<', '>=', '<=', 'exists', 'empty']);

export interface ValidationError {
  line: number;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  /** The (possibly fixed) JSONL string */
  fixed: string;
  /** Parsed messages (empty if invalid) */
  messages: unknown[];
  /** True if beginExecution was auto-synthesized */
  autoFixed?: boolean;
}

/**
 * Pre-process raw LLM response before JSONL fixing:
 * - Strip reasoning model tags (<think>...</think>)
 * - Extract content from markdown code blocks
 * - Collapse pretty-printed multi-line JSON into single lines
 * - Reorder: move beginExecution to the end if placed first
 */
export function normalizeResponse(raw: string): string {
  let text = raw;

  // Strip reasoning traces (qwq-32b, DeepSeek-R1, etc.)
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '');

  // Extract from markdown code blocks
  const codeBlockMatch = text.match(/```(?:jsonl?|a2e)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) text = codeBlockMatch[1];

  text = text.trim();

  // Collapse pretty-printed JSON: detect multi-line JSON objects and join them
  // A pretty-printed object starts with { on one line and has indented content below
  const lines = text.split('\n');
  const collapsed: string[] = [];
  let buffer = '';
  let braceDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Count braces
    for (const ch of trimmed) {
      if (ch === '{' || ch === '[') braceDepth++;
      else if (ch === '}' || ch === ']') braceDepth--;
    }

    buffer += (buffer ? ' ' : '') + trimmed;

    if (braceDepth <= 0) {
      // Complete object — emit as single line
      if (buffer.startsWith('{')) collapsed.push(buffer);
      buffer = '';
      braceDepth = 0;
    }
  }
  // Flush remaining buffer
  if (buffer && buffer.startsWith('{')) collapsed.push(buffer);

  // If collapsing produced results, use them; otherwise keep original lines
  if (collapsed.length > 0) {
    // Reorder: if beginExecution appears before any operationUpdate, move it to the end
    const beginIdx = collapsed.findIndex(l => l.includes('"beginExecution"'));
    const firstOpIdx = collapsed.findIndex(l => l.includes('"operationUpdate"'));
    if (beginIdx >= 0 && firstOpIdx >= 0 && beginIdx < firstOpIdx) {
      const [begin] = collapsed.splice(beginIdx, 1);
      collapsed.push(begin);
    }
    return collapsed.join('\n');
  }

  return text;
}

/**
 * Attempt to fix common LLM JSON mistakes:
 * - Unquoted keys: {type: "value"} → {"type": "value"}
 * - Unquoted string values: {type:operationUpdate} → {"type":"operationUpdate"}
 * - Trailing commas in objects/arrays
 * - Single quotes → double quotes
 */
export function fixJsonl(raw: string): string {
  return raw
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) return trimmed;

      // First try parsing as-is — if it works, don't touch it
      try {
        JSON.parse(trimmed);
        return trimmed;
      } catch { /* needs fixing */ }

      let fixed = trimmed;

      // Replace single quotes with double quotes
      fixed = fixed.replace(/'/g, '"');

      // Add quotes to unquoted keys: {key: → {"key":
      fixed = fixed.replace(/(?<=[\{,\[]\s*)([a-zA-Z_]\w*)\s*:/g, '"$1":');

      // Fix unquoted URL values (before general string fixer to avoid partial match)
      fixed = fixed.replace(/:(https?:\/\/[^\s,\}\]"]+)/g, ':"$1"');

      // Fix unquoted /workflow/ paths
      fixed = fixed.replace(/:(\/workflow\/[^\s,\}\]"]+)/g, ':"$1"');

      // Fix unquoted string values: :word-chars patterns that aren't already quoted,
      // numbers, booleans, null, objects, or arrays
      // This handles: type:operationUpdate, method:GET, strategy:concat, etc.
      fixed = fixed.replace(/:([a-zA-Z_][\w-]*)/g, (match, val) => {
        // Don't quote booleans, null
        if (val === 'true' || val === 'false' || val === 'null') return match;
        return ':"' + val + '"';
      });

      // Fix unquoted operator values like >, <, ==, !=, >=, <=
      fixed = fixed.replace(/"operator"\s*:\s*([><=!]+)/g, '"operator":"$1"');

      // Remove trailing commas before } or ]
      fixed = fixed.replace(/,\s*([\}\]])/g, '$1');

      // Fix truncated JSON: close missing braces/brackets
      fixed = repairTruncatedJson(fixed);

      return fixed;
    })
    .filter(l => l.length > 0)
    .join('\n');
}

/**
 * Attempt to close truncated JSON by appending missing } and ] characters.
 * Common with small models (1-3B) that stop generating mid-structure.
 */
function repairTruncatedJson(line: string): string {
  try {
    JSON.parse(line);
    return line;
  } catch { /* needs repair */ }

  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;

  for (const ch of line) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    else if (ch === '}') openBraces--;
    else if (ch === '[') openBrackets++;
    else if (ch === ']') openBrackets--;
  }

  if (openBraces <= 0 && openBrackets <= 0) return line;

  // Remove trailing comma before closing
  let repaired = line.replace(/,\s*$/, '');
  // Close any unclosed strings (heuristic: odd number of unescaped quotes)
  const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) repaired += '"';

  repaired += ']'.repeat(Math.max(0, openBrackets));
  repaired += '}'.repeat(Math.max(0, openBraces));

  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return line; // Can't repair — return original
  }
}

/**
 * Validate an A2E JSONL workflow string.
 *
 * Checks:
 * 1. Each line is valid JSON
 * 2. Each message has a valid `type`
 * 3. `operationUpdate` has `operationId` + valid `operation`
 * 4. `beginExecution` has `executionId` + `operationOrder`
 * 5. All operationIds in `operationOrder` are defined
 * 6. Operation-specific field validation
 *
 * Automatically attempts fixJsonl before validation.
 */
export function validateWorkflow(raw: string): ValidationResult {
  // Stage 1: normalize (strip tags, collapse pretty-print, reorder)
  const normalized = normalizeResponse(raw);
  // Stage 2: fix JSON syntax
  const fixed = fixJsonl(normalized);
  const errors: ValidationError[] = [];
  const messages: unknown[] = [];
  const definedOps = new Set<string>();
  let hasBeginExecution = false;
  let referencedOps: string[] = [];
  let autoFixed = false;

  const lines = fixed.split('\n').filter(l => l.trim().length > 0);

  if (lines.length === 0) {
    errors.push({ line: 0, message: 'Empty workflow — no JSONL lines found' });
    return { valid: false, errors, fixed, messages };
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i].trim();

    // Parse JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      errors.push({ line: lineNum, message: `Invalid JSON: ${line.slice(0, 80)}` });
      continue;
    }

    messages.push(parsed);

    // Check type
    if (typeof parsed.type !== 'string') {
      errors.push({ line: lineNum, message: 'Missing or invalid "type" field' });
      continue;
    }

    if (parsed.type === 'operationUpdate') {
      validateOperationUpdate(parsed, lineNum, errors, definedOps);
    } else if (parsed.type === 'beginExecution') {
      if (hasBeginExecution) {
        errors.push({ line: lineNum, message: 'Multiple beginExecution messages — only one allowed' });
      }
      hasBeginExecution = true;
      referencedOps = validateBeginExecution(parsed, lineNum, errors);
    } else {
      errors.push({ line: lineNum, message: `Unknown message type: "${parsed.type}"` });
    }
  }

  // Cross-check: all referenced operationIds must be defined
  if (hasBeginExecution) {
    for (const opId of referencedOps) {
      if (!definedOps.has(opId)) {
        errors.push({ line: 0, message: `operationOrder references undefined operationId: "${opId}"` });
      }
    }
  }

  // Auto-synthesize missing beginExecution if we have valid operationUpdates
  // This is the most common error for small models (1-3B)
  if (!hasBeginExecution && definedOps.size > 0 && errors.length === 0) {
    const synthesized = {
      type: 'beginExecution',
      executionId: `auto-${Date.now().toString(36)}`,
      operationOrder: [...definedOps],
    };
    messages.push(synthesized);
    hasBeginExecution = true;
    autoFixed = true;
  } else if (!hasBeginExecution && errors.length === 0) {
    errors.push({ line: 0, message: 'Missing beginExecution message' });
  }

  return {
    valid: errors.length === 0,
    errors,
    fixed,
    messages,
    autoFixed,
  };
}

function validateOperationUpdate(
  parsed: Record<string, unknown>,
  lineNum: number,
  errors: ValidationError[],
  definedOps: Set<string>,
): void {
  // operationId
  if (typeof parsed.operationId !== 'string' || !parsed.operationId) {
    errors.push({ line: lineNum, message: 'operationUpdate missing "operationId"' });
    return;
  }

  if (definedOps.has(parsed.operationId)) {
    errors.push({ line: lineNum, message: `Duplicate operationId: "${parsed.operationId}"` });
  }
  definedOps.add(parsed.operationId);

  // operation
  const operation = parsed.operation;
  if (!operation || typeof operation !== 'object') {
    errors.push({ line: lineNum, message: 'operationUpdate missing "operation" object' });
    return;
  }

  const opKeys = Object.keys(operation as object);
  if (opKeys.length !== 1) {
    errors.push({ line: lineNum, message: `operation must have exactly one key (primitive name), got: ${opKeys.join(', ')}` });
    return;
  }

  const primitiveName = opKeys[0];
  if (!VALID_PRIMITIVES.has(primitiveName)) {
    errors.push({ line: lineNum, message: `Unknown primitive: "${primitiveName}". Valid: ${[...VALID_PRIMITIVES].join(', ')}` });
    return;
  }

  const config = (operation as Record<string, unknown>)[primitiveName] as Record<string, unknown>;
  if (!config || typeof config !== 'object') {
    errors.push({ line: lineNum, message: `${primitiveName} configuration must be an object` });
    return;
  }

  // Primitive-specific validation
  switch (primitiveName) {
    case 'ApiCall':
      validateApiCall(config, lineNum, errors);
      break;
    case 'FilterData':
      validateFilterData(config, lineNum, errors);
      break;
    case 'TransformData':
      validateTransformData(config, lineNum, errors);
      break;
    case 'Conditional':
      validateConditional(config, lineNum, errors);
      break;
    case 'Loop':
      validateLoop(config, lineNum, errors);
      break;
    case 'StoreData':
      validateStoreData(config, lineNum, errors);
      break;
    case 'Wait':
      validateWait(config, lineNum, errors);
      break;
    case 'MergeData':
      validateMergeData(config, lineNum, errors);
      break;
  }
}

function validateBeginExecution(
  parsed: Record<string, unknown>,
  lineNum: number,
  errors: ValidationError[],
): string[] {
  if (typeof parsed.executionId !== 'string' || !parsed.executionId) {
    errors.push({ line: lineNum, message: 'beginExecution missing "executionId"' });
  }

  if (!Array.isArray(parsed.operationOrder)) {
    errors.push({ line: lineNum, message: 'beginExecution missing "operationOrder" array' });
    return [];
  }

  if (parsed.operationOrder.length === 0) {
    errors.push({ line: lineNum, message: 'operationOrder must have at least 1 entry' });
  }

  return parsed.operationOrder as string[];
}

function validateApiCall(config: Record<string, unknown>, line: number, errors: ValidationError[]): void {
  if (typeof config.method !== 'string' || !VALID_METHODS.has(config.method)) {
    errors.push({ line, message: `ApiCall: invalid method "${config.method}". Valid: ${[...VALID_METHODS].join(', ')}` });
  }
  if (typeof config.url !== 'string' || !config.url) {
    errors.push({ line, message: 'ApiCall: missing "url"' });
  }
  if (typeof config.outputPath !== 'string' || !config.outputPath.startsWith('/workflow/')) {
    errors.push({ line, message: 'ApiCall: "outputPath" must start with /workflow/' });
  }
}

function validateFilterData(config: Record<string, unknown>, line: number, errors: ValidationError[]): void {
  if (typeof config.inputPath !== 'string' || !config.inputPath.startsWith('/workflow/')) {
    errors.push({ line, message: 'FilterData: "inputPath" must start with /workflow/' });
  }
  if (!Array.isArray(config.conditions) || config.conditions.length === 0) {
    errors.push({ line, message: 'FilterData: "conditions" must be a non-empty array' });
  } else {
    for (const cond of config.conditions as Record<string, unknown>[]) {
      if (typeof cond.field !== 'string') errors.push({ line, message: 'FilterData: condition missing "field"' });
      if (typeof cond.operator !== 'string' || !VALID_FILTER_OPS.has(cond.operator)) {
        errors.push({ line, message: `FilterData: invalid operator "${cond.operator}"` });
      }
    }
  }
  if (typeof config.outputPath !== 'string' || !config.outputPath.startsWith('/workflow/')) {
    errors.push({ line, message: 'FilterData: "outputPath" must start with /workflow/' });
  }
}

function validateTransformData(config: Record<string, unknown>, line: number, errors: ValidationError[]): void {
  if (typeof config.inputPath !== 'string' || !config.inputPath.startsWith('/workflow/')) {
    errors.push({ line, message: 'TransformData: "inputPath" must start with /workflow/' });
  }
  if (typeof config.transform !== 'string' || !VALID_TRANSFORMS.has(config.transform)) {
    errors.push({ line, message: `TransformData: invalid transform "${config.transform}". Valid: ${[...VALID_TRANSFORMS].join(', ')}` });
  }
  if (typeof config.outputPath !== 'string' || !config.outputPath.startsWith('/workflow/')) {
    errors.push({ line, message: 'TransformData: "outputPath" must start with /workflow/' });
  }
}

function validateConditional(config: Record<string, unknown>, line: number, errors: ValidationError[]): void {
  const cond = config.condition as Record<string, unknown> | undefined;
  if (!cond || typeof cond !== 'object') {
    errors.push({ line, message: 'Conditional: missing "condition" object' });
  } else {
    if (typeof cond.path !== 'string' || !cond.path.startsWith('/workflow/')) {
      errors.push({ line, message: 'Conditional: condition.path must start with /workflow/' });
    }
    if (typeof cond.operator !== 'string' || !VALID_CONDITION_OPS.has(cond.operator)) {
      errors.push({ line, message: `Conditional: invalid operator "${cond.operator}"` });
    }
  }
  if (!Array.isArray(config.ifTrue)) {
    errors.push({ line, message: 'Conditional: missing "ifTrue" array' });
  }
}

function validateLoop(config: Record<string, unknown>, line: number, errors: ValidationError[]): void {
  if (typeof config.inputPath !== 'string' || !config.inputPath.startsWith('/workflow/')) {
    errors.push({ line, message: 'Loop: "inputPath" must start with /workflow/' });
  }
  if (!Array.isArray(config.operations) || config.operations.length === 0) {
    errors.push({ line, message: 'Loop: "operations" must be a non-empty array' });
  }
}

function validateStoreData(config: Record<string, unknown>, line: number, errors: ValidationError[]): void {
  if (typeof config.inputPath !== 'string' || !config.inputPath.startsWith('/workflow/')) {
    errors.push({ line, message: 'StoreData: "inputPath" must start with /workflow/' });
  }
  if (typeof config.storage !== 'string' || !VALID_STORAGE.has(config.storage)) {
    errors.push({ line, message: `StoreData: invalid storage "${config.storage}". Valid: ${[...VALID_STORAGE].join(', ')}` });
  }
  if (typeof config.key !== 'string' || !config.key) {
    errors.push({ line, message: 'StoreData: missing "key"' });
  }
}

function validateWait(config: Record<string, unknown>, line: number, errors: ValidationError[]): void {
  if (typeof config.duration !== 'number' || config.duration < 0 || config.duration > 600000) {
    errors.push({ line, message: 'Wait: "duration" must be a number between 0 and 600000' });
  }
}

function validateMergeData(config: Record<string, unknown>, line: number, errors: ValidationError[]): void {
  if (!Array.isArray(config.sources) || config.sources.length < 2) {
    errors.push({ line, message: 'MergeData: "sources" must be an array with at least 2 items' });
  }
  if (typeof config.strategy !== 'string' || !VALID_STRATEGIES.has(config.strategy)) {
    errors.push({ line, message: `MergeData: invalid strategy "${config.strategy}". Valid: ${[...VALID_STRATEGIES].join(', ')}` });
  }
  if (typeof config.outputPath !== 'string' || !config.outputPath.startsWith('/workflow/')) {
    errors.push({ line, message: 'MergeData: "outputPath" must start with /workflow/' });
  }
}
