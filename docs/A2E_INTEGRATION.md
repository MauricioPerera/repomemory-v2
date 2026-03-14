# A2E Integration — RepoMemory

Integration of the [A2E (Agent-to-Execution) protocol](https://github.com/MauricioPerera/a2e) into RepoMemory's persistent memory system.

## Architecture

RepoMemory acts as the **memory and knowledge layer** for A2E. Instead of the LLM interacting with two separate systems (RepoMemory + A2E), the LLM interacts only with RepoMemory. RepoMemory contains A2E's protocol documentation as knowledge, workflow examples as skills, and execution history as memories.

```
User query
    │
    ▼
┌──────────────┐     recall (TF-IDF + scoring)     ┌──────────────────────┐
│  RepoMemory  │ ──────────────────────────────────▶│  Context for LLM     │
│              │                                    │  - A2E primitives    │
│  memories    │  (workflows exitosos/fallidos)     │  - workflow examples │
│  skills      │  (ejemplos de workflows)           │  - corrections       │
│  knowledge   │  (documentación de primitivas)     │  - few-shot pairs    │
└──────────────┘                                    └──────────┬───────────┘
                                                               │
                                                               ▼
                                                    ┌──────────────────────┐
                                                    │  LLM generates       │
                                                    │  A2E JSONL workflow  │
                                                    └──────────┬───────────┘
                                                               │
                                                               ▼
                                                    ┌──────────────────────┐
                                                    │  A2E Executor        │
                                                    │  (black box)         │
                                                    └──────────┬───────────┘
                                                               │
                                                     success / failure
                                                               │
                                                               ▼
                                                    ┌──────────────────────┐
                                                    │  RepoMemory saves    │
                                                    │  result as memory    │
                                                    │  (fact or correction)│
                                                    └──────────────────────┘
```

The LLM learns A2E from RepoMemory's knowledge base — it doesn't need prior training on the protocol. A2E is a black box that receives a workflow definition and returns results. RepoMemory doesn't know or care how A2E executes internally.

## A2E vs MCP Tools — Efficiency Comparison

### Why A2E is more efficient than traditional MCP/tool-calling

With MCP tools, the LLM executes workflows **step by step**: call a tool, wait for the result, decide the next tool, call it, wait again. Each round trip re-sends all tool definitions and the full conversation history.

With A2E, the LLM defines the **entire workflow in a single response**. A2E executes all operations and returns the final result. One round trip regardless of complexity.

### Measured token consumption (Cloudflare Workers AI, granite-4.0-h-micro)

#### Simple workflow (2 steps: fetch + filter)

| Metric | MCP Tools | A2E Knowledge |
|---|---|---|
| Total tokens | 563 | 425 |
| Round trips | 2 (minimum) | 1 |
| Token savings | — | **25%** |

#### Complex workflow (5 steps: 2 fetches + merge + filter + sort)

| Metric | MCP Tools | A2E Knowledge |
|---|---|---|
| Total tokens | **3,354** | **369** |
| Round trips | 5 | 1 |
| Token savings | — | **89%** |
| Latency savings | — | **80%** |

### Why the gap grows with complexity

MCP tools suffer from **context accumulation**. Each round trip sends:

1. **All tool definitions** — ~500 tokens for 4 simple tools, ~5,300+ tokens for RepoMemory's 35+ tools. Sent every single time.
2. **Full conversation history** — grows with each step as tool results are appended.
3. **Previous tool results** — JSON payloads from APIs that the LLM must re-read.

In the 5-step workflow measured above:
- Step 1 input: 572 tokens
- Step 5 input: 628 tokens (grew from accumulated history)
- Tool definitions alone were sent **5 times**: ~2,500 wasted tokens

A2E eliminates all three problems:
- **No tool definitions** — the LLM receives only the relevant knowledge from recall, not a static list of all tools.
- **No history accumulation** — single request, single response.
- **No intermediate results** — the LLM never sees API responses; A2E handles them internally.

### Qualitative differences

| Aspect | MCP Tools | A2E Knowledge |
|---|---|---|
| **Round trips** | 1 per tool call (sequential) | Always 1 |
| **Tool defs per request** | All tools, always | 0 — knowledge comes from recall |
| **Context growth** | Linear per step | Fixed — query + relevant knowledge |
| **Execution model** | LLM waits for each tool result to decide next step | LLM defines entire workflow upfront |
| **Error recovery** | LLM re-decides (more tokens) | A2E executor handles retries internally |
| **Learning** | None — tools are static | Yes — successful workflows reinforced, failed ones penalized (correctionBoost 2x) |
| **Selectivity** | All tools always sent | Only relevant knowledge (TF-IDF + scoring + maxChars budget) |

### The key factor: recall selectivity

With MCP, all tool definitions are sent in every request regardless of relevance.

With A2E knowledge in RepoMemory, the recall engine with the `a2e` template returns only the knowledge **relevant to the query**. If the user asks "make a POST request", they get the ApiCall documentation and a POST example — not all 8 primitives and all examples. The recall has a configurable budget (`maxItems`, `maxChars`) that caps how much context is injected.

## Module Structure

```
src/a2e/
  index.ts              — Re-exports
  sanitize.ts           — Secret sanitization (resolve + sanitize)
  circuit-breaker.ts    — Circuit breaker for failing API hosts
  workflow-skills.ts    — Save, recall, parse, mine workflow patterns
  knowledge.ts          — A2E protocol documentation as RepoMemory knowledge
  validate.ts           — Three-stage validation pipeline (normalize → fix → validate)
```

## Validation Pipeline (`src/a2e/validate.ts`)

Three-stage pipeline that handles LLM output imperfections across models from 1B to 120B:

```
Raw LLM output → normalizeResponse() → fixJsonl() → validateWorkflow()
```

### Stage 1: `normalizeResponse(raw)`
- Strips reasoning model tags (`<think>...</think>`) — qwq-32b, DeepSeek-R1
- Extracts content from markdown code blocks (` ```jsonl ``` `)
- Collapses pretty-printed multi-line JSON into single JSONL lines
- Reorders: moves `beginExecution` to the end if placed before `operationUpdate`

### Stage 2: `fixJsonl(raw)`
- Fixes unquoted keys: `{type: "value"}` → `{"type": "value"}`
- Fixes unquoted string values, URLs, `/workflow/` paths
- Removes trailing commas, replaces single quotes
- **Repairs truncated JSON**: counts open vs close braces and appends missing `}` / `]`

### Stage 3: `validateWorkflow(raw)`
- Validates each JSON line: type field, operationUpdate structure, primitive-specific fields
- Cross-references operationIds between operationOrder and defined operations
- **Auto-synthesizes missing `beginExecution`**: if all operationUpdates are valid but beginExecution is absent, generates one automatically using the defined operationIds
- Returns `autoFixed: true` when beginExecution was synthesized

### Impact (tested across 11 models)

| Model | Before pipeline | After pipeline |
|-------|----------------|----------------|
| llama-3.2-1b (1B) | Did not converge | Valid in 1 iteration |
| llama-3.2-3b (3B) | 1-5 iterations | Valid in 1 iteration |
| gemma-7b-it (7B) | 2 iterations | 2 iterations (8K context limit) |
| Models >= 20B | Valid in 1 | Valid in 1 (no change) |

Full results: see `docs/CTT_RESEARCH_REPORT.md`

## A2E Knowledge Ingestion

The `knowledge.ts` module contains the complete A2E protocol documentation structured as RepoMemory entries:

- **9 knowledge entries**: one per primitive (ApiCall, FilterData, TransformData, Conditional, Loop, StoreData, Wait, MergeData) + JSONL format documentation
- **7 skill entries**: workflow examples for common patterns (GET + filter, POST with body, authenticated requests, multi-step pipelines, loops, merges, conditionals)

### `ingestA2EKnowledge(repo, agentId): IngestA2EKnowledgeResult`

Ingests A2E protocol documentation into RepoMemory's knowledge and skills collections.

```typescript
import { RepoMemory, ingestA2EKnowledge } from '@rckflr/repomemory';

const repo = new RepoMemory({ dir: './memory' });
const result = ingestA2EKnowledge(repo, 'my-agent');
// => { knowledge: 9, skills: 7, total: 16 }
```

- Uses `saveOrUpdate` with source-based deduplication — safe to call repeatedly.
- Knowledge entries include `questions` for improved TF-IDF recall.
- Skill entries follow the `"Para <query>: [A2E: <workflow>]"` format recognized by RecallEngine's few-shot extraction.
- Scoped per agent — each agent gets its own copy.

### MCP Tool

| Tool | Description |
|------|-------------|
| `a2e_ingest_knowledge` | Ingest A2E protocol documentation. Param: `agentId` (required). |

## Recall Template

The unified `a2e` template is optimized for all model sizes (1B to 120B):

```typescript
const ctx = repo.recall('agent1', 'user1', 'fetch users and filter active', {
  template: 'a2e',
  maxItems: 30,
  maxChars: 12000,
});
// ctx.formatted contains:
// - Direct preamble: "Output ONLY valid A2E JSONL..."
// - Workflow examples with few-shot pairs (skills, weight 2.0x)
// - Corrections & context (memories, weight 1.5x)
// - Primitives reference (knowledge, weight 1.0x)
```

Template configuration:
- **Section order**: skills → memories → knowledge → profile (examples first)
- **Collection weights**: skills 2.0x, memories 1.5x, knowledge 1.0x
- **Few-shot**: enabled (max 7 examples)
- **Preamble**: Direct instructions — works equally well for 1B and 120B models
- **Preamble**: instructs the LLM to avoid corrections and use few-shot examples

### MCP Tool

| Tool | Description |
|------|-------------|
| `a2e_recall` | Recall with `a2e` template. Params: `agentId`, `userId`, `query` (required), `maxItems`, `maxChars` (optional). |

## Secret Sanitization (`src/a2e/sanitize.ts`)

### `resolveSecrets(text, secrets): string`

Replaces `{{VAR}}` placeholders with actual secret values before execution.

```typescript
import { resolveSecrets } from '@rckflr/repomemory';

const resolved = resolveSecrets(
  'ApiCall GET https://api.weather.com?appid={{API_KEY}}',
  { API_KEY: 'abc123' }
);
// => 'ApiCall GET https://api.weather.com?appid=abc123'
```

### `sanitizeSecrets(text, secrets): string`

Two-pass sanitization before saving to memory:

1. **Known secrets** — replaces exact values with `{{VAR}}` placeholders (sorted by length to avoid partial matches)
2. **Heuristic** — redacts common auth query params (`apikey`, `token`, `password`, `appid`, `client_secret`, etc.)

```typescript
import { sanitizeSecrets } from '@rckflr/repomemory';

const safe = sanitizeSecrets(
  'ApiCall GET https://api.weather.com?appid=mysecret123&q=Madrid',
  { APPID: 'mysecret123' }
);
// => 'ApiCall GET https://api.weather.com?appid={{APPID}}&q=Madrid'
```

## Circuit Breaker (`src/a2e/circuit-breaker.ts`)

### `checkCircuitBreaker(repo, agentId, userId, host, threshold?): CircuitBreakerResult`

Queries RepoMemory for `a2e-error` correction memories matching a host. If the count meets the threshold (default: 3), returns `open: true`.

```typescript
import { checkCircuitBreaker } from '@rckflr/repomemory';

const result = checkCircuitBreaker(repo, 'agent1', 'user1', 'api.example.com');
if (result.open) {
  console.log(result.message);
  // "Circuit breaker open — api.example.com has 3 recent errors..."
}
```

### `checkCircuitBreakerFromTag(repo, agentId, userId, rawTag, threshold?): CircuitBreakerResult | null`

Extracts the host from the A2E tag automatically. Returns `null` for non-HTTP operations.

## Workflow Skills (`src/a2e/workflow-skills.ts`)

### `saveWorkflowSkill(repo, agentId, userId, rawTag, userQuery, secrets?, extraTags?): void`

Saves a successful A2E workflow as a memory with format `"Para <query>: [A2E: <tag>]"`, category `fact`, tags `['a2e', 'workflow', ...]`. Secrets are sanitized before saving.

### `saveWorkflowError(repo, agentId, userId, rawTag, errorMsg, userQuery, secrets?): void`

Saves a failed workflow as a `correction` memory with tag `a2e-error`. RepoMemory's `correctionBoost` (2x) ensures these surface above normal memories, warning agents not to repeat the pattern.

### `extractApiKnowledge(repo, agentId, userId, rawTag, result, secrets?): void`

Extracts API endpoint knowledge from a successful ApiCall. Saves base URL, method, pathname, and response field names.

### `recallWorkflows(repo, agentId, userId, query, limit?): string[]`

Searches for A2E workflow patterns matching a query. Returns workflow content strings, excluding error corrections.

### `parseWorkflowSkill(content): FewShotExample | null`

Parses `"Para <question>: [A2E: <tag>]"` into a `{ user, assistant }` pair for few-shot injection.

### `mineA2ePatterns(repo, agentId, userId, sessionContent, secrets?): number`

Deterministic extraction (no AI needed) of A2E patterns from session text. Finds `[A2E: ...]` tags and associates them with preceding `user:` lines. Returns the number of patterns saved.

## MCP Tools Summary

| Tool | Description |
|------|-------------|
| `a2e_save_workflow` | Save a workflow (success or failure). Extracts API knowledge on success. |
| `a2e_recall_workflows` | Recall matching A2E workflow patterns. |
| `a2e_check_circuit` | Check circuit breaker status for an API host. |
| `a2e_ingest_knowledge` | Ingest A2E protocol documentation into knowledge + skills. |
| `a2e_recall` | Recall with `a2e` template (optimized for workflow generation). |

## RecallEngine Integration

The RecallEngine's few-shot extraction (`extractFewShotExamples`) recognizes `[A2E: ...]` tags alongside `[MCP: ...]`, `[CALC: ...]`, and `[FETCH: ...]`. This means:

- Skills saved with A2E workflow patterns are automatically converted to user/assistant conversation pairs
- These few-shot examples are returned when using templates with `extractFewShot: true`
- Small models learn A2E workflow generation from demonstrated examples

## CTT (Context-Time Training) Integration

A2E leverages RepoMemory's CTT mechanisms:

- **Correction boost** (2x) — Failed workflows saved as `correction` category score higher, preventing agents from repeating errors
- **saveOrUpdate dedup** — Workflow skills use `saveOrUpdate()` to prevent duplicate patterns
- **Access tracking** — Recalled workflows increment access counts, boosting frequently-used patterns
- **Time decay** — Old workflows naturally score lower, favoring recent successful patterns

## Usage Example

```typescript
import {
  RepoMemory,
  ingestA2EKnowledge,
  saveWorkflowSkill,
  saveWorkflowError,
  checkCircuitBreakerFromTag,
  resolveSecrets,
} from '@rckflr/repomemory';

const repo = new RepoMemory({ dir: './memory' });
const secrets = { API_KEY: process.env.WEATHER_API_KEY! };

// 1. Ingest A2E knowledge (once, or on agent setup)
ingestA2EKnowledge(repo, 'agent1');

// 2. Recall context for a user query
const ctx = repo.recall('agent1', 'user1', 'get weather forecast', {
  template: 'a2e',
});
// ctx.formatted → inject into LLM system prompt

// 3. LLM generates A2E JSONL workflow from context
// ... (LLM call)

// 4. Before execution: check circuit breaker
const circuit = checkCircuitBreakerFromTag(repo, 'agent1', 'user1', rawTag);
if (circuit?.open) {
  console.log(circuit.message);
  return;
}

// 5. Before execution: resolve secrets
const resolvedTag = resolveSecrets(rawTag, secrets);

// 6. Execute via A2E (external executor — black box)
// ... (A2E execution)

// 7. After execution: save result
if (success) {
  saveWorkflowSkill(repo, 'agent1', 'user1', rawTag, userQuery, secrets);
} else {
  saveWorkflowError(repo, 'agent1', 'user1', rawTag, errorMsg, userQuery, secrets);
}
```

## A2E Protocol Reference

The A2E protocol defines 8 core operations:

| Operation | Description |
|-----------|-------------|
| `ApiCall` | HTTP request (GET, POST, PUT, DELETE, PATCH) |
| `FilterData` | Filter arrays by field conditions |
| `TransformData` | Map, sort, group, aggregate, select |
| `Conditional` | If/else branching |
| `Loop` | Iterate over arrays |
| `StoreData` | Persist to storage backends |
| `Wait` | Pause execution |
| `MergeData` | Combine multiple data sources |

Full specification: [github.com/MauricioPerera/a2e](https://github.com/MauricioPerera/a2e)
