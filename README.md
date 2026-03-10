# RepoMemory v2

[![npm version](https://img.shields.io/npm/v/@rckflr/repomemory.svg)](https://www.npmjs.com/package/@rckflr/repomemory)
[![license](https://img.shields.io/npm/l/@rckflr/repomemory.svg)](https://github.com/rckflr/repomemory-v2/blob/main/LICENSE)

Git-inspired agentic memory system. Zero runtime dependencies.

RepoMemory provides persistent, versioned memory for AI agents. Every change is tracked through an immutable commit chain with content-addressable storage — like Git, but purpose-built for agent memory.

## Features

- **Content-addressable storage** — automatic deduplication, hash-verified integrity
- **Immutable history** — every save creates a commit; full audit trail per entity (including deletes)
- **5 entity types** — Memories, Skills, Knowledge, Sessions, Profiles
- **Shared scope** — `SHARED_AGENT_ID` (`_shared`) for cross-agent skills and knowledge
- **Cross-agent profiles** — query a user's profile across all agents
- **Conversations** — group sessions by `conversationId`
- **Structured sessions** — save raw transcript or structured `messages[]` with role/content/timestamp
- **Recall engine** — single `recall()` call retrieves and formats relevant context across all collections
- **Incremental TF-IDF search** — cached to disk, updated incrementally on writes, Jaccard tag overlap, Porter stemming
- **Query expansion** — automatic synonym/abbreviation mapping (e.g., "ts config" matches "TypeScript configuration")
- **Configurable scoring** — tunable weights for TF-IDF, tag overlap, decay rate, and access boost cap
- **Deduplication** — `saveOrUpdate()` on memories, skills, and knowledge detects similar content with configurable threshold
- **Batch operations** — `saveMany()`, `deleteMany()`, and `incrementMany()` for bulk writes with single flush. `saveMany()` emits `entity:save` per item
- **Pagination** — `listPaginated()` and `count()` for efficient listing with `limit`/`offset`/`hasMore`
- **Event system** — typed event bus for entity lifecycle hooks (`entity:save`, `entity:update`, `entity:delete`, `session:mined`, `session:automine:error`, `consolidation:done`). Handler errors are caught internally and never crash core operations
- **TTL cleanup** — remove stale entities by age, with dry-run support and audit log rotation
- **File locking** — filesystem-based mutex wraps every `save()` and `delete()` for concurrent access safety (configurable via `lockEnabled`)
- **AI validation** — strict schema validators on AI responses (non-empty content, typed tags, valid IDs) with automatic retry on malformed output
- **RAG pipeline** — ingest documents from disk, chunk with 3 strategies (fixed/paragraph/markdown), query with optional AI answer generation, incremental sync via SHA-256 hashing. Zero embeddings — reuses TF-IDF search
- **Optional AI** — mining and consolidation (memories, skills, knowledge) via OpenAI, Anthropic, or Ollama
- **Zero runtime dependencies** — only Node.js built-ins (`node:fs`, `node:path`, `node:crypto`, `fetch`)
- **Middleware pipeline** — `use()` to register `beforeSave`/`beforeUpdate`/`beforeDelete` hooks for validation, transformation, or vetoing operations
- **Export/Import** — portable JSON serialization of all entities + access counts for backup, migration, or cloning
- **MCP server** — expose all operations via Model Context Protocol (JSON-RPC 2.0 over stdio) for LLM tool-use integrations
- **HTTP API** — lightweight REST server (`node:http`) for language-agnostic integrations (CORS enabled)
- **Auto-mining** — automatically extract memories/skills/profile when sessions are saved (`autoMine` config)
- **Compact prompts** — configurable prompt strategy optimized for small reasoning models (<3B params)
- **Library + CLI + MCP + HTTP** — import as a TypeScript library, use from the command line, or connect via MCP/HTTP
- **Content size limit** — 1 MB max per entity content, enforced via `Buffer.byteLength` to prevent DoS
- **Input validation** — entity/agent/user IDs validated against path traversal (`/`, `\`, `..`, `:`, `\0`); entity types checked against whitelist; tags capped at 50 per entity
- **Bounded queries** — paginated `listConversations()`, capped `getByUserAcrossAgents()`, bounded `listEntitiesByPrefix()`, search limit clamped to 200
- **Graceful shutdown** — HTTP server handles `SIGTERM`/`SIGINT` with flush + 5-second forced timeout
- **Cross-platform** — works on Windows, macOS, and Linux
- **Context-Time Training (CTT)** — trains the agent, not the model. The agent accumulates knowledge from experience (mining), consolidates it over time, and corrects errors — while the model stays frozen. A trained agent with a 0.6B model outperforms an untrained agent with a 20B model. Includes correction boost, prompt templates, and effectiveness metrics
- **Neural semantic search** — optional EmbeddingGemma-300m via `@huggingface/transformers` with Matryoshka 3-level ranking (128→256→768 dims). Cross-lingual, MMR diversity, fire-and-forget indexing
- **Cloudflare Workers AI** — dedicated provider with OpenAI-compatible endpoints and AI Gateway support

## Install

```bash
npm install @rckflr/repomemory
```

## Quick Start

### As a library

```ts
import { RepoMemory } from '@rckflr/repomemory';

const mem = new RepoMemory({ dir: '.repomemory' });

// Save a memory
const [saved] = mem.memories.save('agent-1', 'user-1', {
  content: 'User prefers TypeScript strict mode',
  tags: ['preferences', 'typescript'],
  category: 'fact',
});

// Search
const results = mem.memories.search('agent-1', 'user-1', 'typescript', 5);

// View history
const history = mem.memories.history(saved.id);

// Update
mem.memories.update(saved.id, { content: 'User requires TypeScript strict mode' });

// Delete
mem.memories.delete(saved.id);
```

### As a CLI

```bash
repomemory init
repomemory save memory --agent my-agent --user user-1 --content "Prefers dark mode" --tags ui,preferences
repomemory search "dark mode" --agent my-agent --user user-1
repomemory history <entityId>
repomemory stats
repomemory verify
```

## AI Providers

RepoMemory supports 4 AI providers for mining, consolidation, and RAG. All share the same `AiProvider` interface and can be swapped freely.

```ts
import { OllamaProvider, OpenAiProvider, AnthropicProvider, CloudflareProvider } from '@rckflr/repomemory/ai';
```

| Provider | Default Model | API Key Required | Local/Cloud | Key Feature |
|----------|---------------|-----------------|-------------|-------------|
| `OllamaProvider` | `llama3.1` | No | Local | Zero cost, private, reasoning model support |
| `OpenAiProvider` | `gpt-4o-mini` | Yes (or custom endpoint) | Cloud/Local | Compatible with any OpenAI-format API |
| `AnthropicProvider` | `claude-sonnet-4-20250514` | Yes | Cloud | Best quality for mining/consolidation |
| `CloudflareProvider` | `@cf/meta/llama-3.1-8b-instruct` | Yes (API token) | Cloud | Free tier, AI Gateway analytics |

### Ollama (local, zero cost)

```ts
const ai = new OllamaProvider({
  model: 'llama3.1',                // any Ollama model
  baseUrl: 'http://localhost:11434', // default
  numPredict: 2048,                  // max output tokens (default: 2048)
  numCtx: 4096,                      // context window (default: 4096)
  disableThinking: true,             // disable reasoning for qwen3/deepseek-r1 (default: true)
});
const mem = new RepoMemory({ dir: '.repomemory', ai, autoMine: true });
```

### OpenAI (or any OpenAI-compatible API)

```ts
// Official OpenAI
const ai = new OpenAiProvider({ apiKey: 'sk-...' });

// Custom endpoint (llama.cpp, vLLM, LM Studio, etc.)
const ai = new OpenAiProvider({
  baseUrl: 'http://localhost:8080/v1',  // or OPENAI_BASE_URL env var
  model: 'local-model',
  // apiKey not required for custom endpoints
});
```

### Anthropic

```ts
const ai = new AnthropicProvider({
  apiKey: 'sk-ant-...',  // or ANTHROPIC_API_KEY env var
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
});
```

### Cloudflare Workers AI

```ts
const ai = new CloudflareProvider({
  accountId: '...',   // or CLOUDFLARE_ACCOUNT_ID env var
  apiToken: '...',    // or CLOUDFLARE_API_TOKEN env var
  model: '@cf/meta/llama-3.1-8b-instruct',
  gateway: 'my-gateway',  // optional, for AI Gateway analytics/caching
});
```

All providers include: 120s timeout (configurable), 2 retries with exponential backoff, transient error detection (429/5xx).

## API Reference

### `RepoMemory`

```ts
import { RepoMemory } from '@rckflr/repomemory';

const mem = new RepoMemory({
  dir: '.repomemory',
  ai: provider,              // optional — OllamaProvider, OpenAiProvider, AnthropicProvider
  dedupThreshold: 0.2,       // optional — similarity threshold for saveOrUpdate (default: 0.2)
  maxSessionChars: 100_000,  // optional — max chars sent to AI mining (default: 100K)
  lockEnabled: true,         // optional — filesystem locking for concurrent access (default: true)
  autoMine: false,           // optional — auto-mine sessions on save (requires ai, default: false)
  compactPrompts: undefined, // optional — use compact prompts for small models (default: auto-detect)
  scoring: {                 // optional — tune search ranking behavior
    tfidfWeight: 0.7,        // weight for TF-IDF relevance (default: 0.7)
    tagWeight: 0.3,          // weight for tag overlap (default: 0.3)
    decayRate: 0.005,        // decay per day; 0 = no decay (default: 0.005)
    maxAccessBoost: 5.0,     // cap on access boost multiplier (default: 5.0)
  },
});
```

#### Collections

Each collection provides CRUD + search:

| Method | Signature | Returns |
|--------|-----------|---------|
| `save` | `(agentId, userId?, input)` | `[Entity, CommitInfo]` |
| `saveMany` | `(items[])` | `[Entity, CommitInfo][]` |
| `get` | `(entityId)` | `Entity \| null` |
| `update` | `(entityId, updates)` | `[Entity, CommitInfo]` |
| `delete` | `(entityId)` | `CommitInfo` |
| `deleteMany` | `(entityIds[])` | `CommitInfo[]` |
| `list` | `(agentId, userId?)` | `Entity[]` |
| `listPaginated` | `(agentId, userId?, { limit?, offset? })` | `ListResult<Entity>` |
| `count` | `(agentId, userId?)` | `number` |
| `history` | `(entityId)` | `CommitInfo[]` |

All collections also have `listPaginated(agentId, userId?, { limit?, offset? })`, `count(agentId, userId?)`, and `deleteMany(entityIds)`. Memories, skills, and knowledge have `saveOrUpdate()` for automatic deduplication.

##### `mem.memories`

```ts
mem.memories.save('agent-1', 'user-1', {
  content: 'User prefers TypeScript',
  tags: ['preferences'],        // optional, default: []
  category: 'fact',             // 'fact' | 'decision' | 'issue' | 'task', default: 'fact'
  sourceSession: 'session-id',  // optional
});

mem.memories.search('agent-1', 'user-1', 'typescript', 10);

// Save or update (deduplicates automatically)
const [entity, commit, { deduplicated }] = mem.memories.saveOrUpdate('agent-1', 'user-1', {
  content: 'User prefers TypeScript strict mode with noUncheckedIndexedAccess',
  tags: ['preferences', 'typescript'],
  category: 'fact',
});

// Batch save (single flush at end — faster for bulk inserts)
mem.memories.saveMany([
  { agentId: 'agent-1', userId: 'user-1', input: { content: '...', tags: ['a'] } },
  { agentId: 'agent-1', userId: 'user-1', input: { content: '...', tags: ['b'] } },
]);
```

##### `mem.skills`

```ts
mem.skills.save('agent-1', undefined, {
  content: 'Deploy with: npm run build && rsync ...',
  tags: ['deploy'],                // optional
  category: 'procedure',          // 'procedure' | 'configuration' | 'troubleshooting' | 'workflow'
  status: 'active',               // 'active' | 'deprecated' | 'draft'
});

mem.skills.search('agent-1', 'deploy', 10);

// Search including shared skills (from _shared scope)
mem.skills.search('agent-1', 'deploy', 10, true);

// Save a shared skill (accessible by all agents)
mem.skills.saveShared({ content: 'Common deploy procedure', tags: ['deploy'] });

// Save or update (deduplicates by category + content similarity)
const [skill, , { deduplicated }] = mem.skills.saveOrUpdate('agent-1', {
  content: 'Deploy with Docker Compose',
  tags: ['deploy', 'docker'],
  category: 'procedure',
});

// List only shared skills
mem.skills.listShared();
```

##### `mem.knowledge`

```ts
mem.knowledge.save('agent-1', undefined, {
  content: 'API rate limit is 100 req/min...',
  tags: ['api'],
  source: 'docs/api.md',    // optional
  chunkIndex: 0,             // optional
  version: '2.0',            // optional
  questions: ['What is the rate limit?'],  // optional
});

mem.knowledge.search('agent-1', 'rate limit', 10);

// Search including shared knowledge
mem.knowledge.search('agent-1', 'rate limit', 10, true);

// Save/list shared knowledge
mem.knowledge.saveShared({ content: 'Common API docs', tags: ['api'] });
mem.knowledge.listShared();

// Dedup: updates existing if similar content found
mem.knowledge.saveOrUpdate('agent-1', {
  content: 'API rate limit increased to 200 req/min',
  tags: ['api'],
  source: 'docs/api-v2.md',
});
```

##### Pagination & Bulk Operations

```ts
// Paginated listing (any collection)
const page = mem.memories.listPaginated('agent-1', 'user-1', { limit: 20, offset: 0 });
// → { items: Memory[], total: 150, limit: 20, offset: 0, hasMore: true }

// Count without loading all entities
const total = mem.memories.count('agent-1', 'user-1');

// Bulk delete
mem.memories.deleteMany(['memory-abc123', 'memory-def456']);
```

##### `mem.sessions`

```ts
// Save with plain text content
mem.sessions.save('agent-1', 'user-1', {
  content: 'Full session transcript...',
  startedAt: '2024-01-01T00:00:00Z',  // optional
  endedAt: '2024-01-01T01:00:00Z',    // optional
  conversationId: 'conv-abc',          // optional — groups related sessions
});

// Save with structured messages (preferred — AI mining formats them automatically)
mem.sessions.save('agent-1', 'user-1', {
  content: 'fallback text',
  messages: [
    { role: 'user', content: 'How do I deploy?', timestamp: '2024-01-01T00:00:00Z' },
    { role: 'assistant', content: 'Run docker compose up', timestamp: '2024-01-01T00:00:01Z' },
  ],
});

mem.sessions.markMined('session-id');

// List sessions by conversation
mem.sessions.listByConversation('agent-1', 'user-1', 'conv-abc');

// List all conversations (paginated grouped summary)
const convos = mem.sessions.listConversations('agent-1', 'user-1', { limit: 20, offset: 0 });
// { items: [{ conversationId: 'conv-abc', count: 3, latest: '2024-01-03T...' }], total: 5, hasMore: false }
```

##### `mem.profiles`

```ts
mem.profiles.save('agent-1', 'user-1', {
  content: 'Senior developer, prefers concise responses',
  metadata: { language: 'en', timezone: 'UTC-3' },  // optional
});

mem.profiles.getByUser('agent-1', 'user-1');

// Get all profiles for a user across every agent (sorted by updatedAt, default limit: 50)
mem.profiles.getByUserAcrossAgents('user-1');
mem.profiles.getByUserAcrossAgents('user-1', 10);  // custom limit

// Save/get a shared profile (agentId = _shared)
mem.profiles.saveShared('user-1', { content: 'Global user preferences' });
mem.profiles.getSharedByUser('user-1');
```

#### Flush

Search indices and access counts are held in memory and flushed to disk at optimal points:

- **Automatically before search** — `find()` and multi-scope search flush pending index writes to ensure consistency
- **Automatically on batch boundaries** — `saveMany()`, `deleteMany()` flush once at the end
- **Not on individual writes** — single `save()`/`update()`/`delete()` defer flushing for performance (~80% I/O reduction)

Call `flush()` explicitly if you need to ensure all data is persisted (e.g., before process exit):

```ts
mem.memories.save('agent-1', 'user-1', { content: '...', tags: ['a'] });
mem.memories.save('agent-1', 'user-1', { content: '...', tags: ['b'] });
mem.flush();  // persist search indices + access counts to disk
```

#### Recall

`recall()` is the primary read path for agents — it searches across all collections, increments access counts for all returned entities, and returns a pre-formatted context string ready to inject into an LLM system prompt:

```ts
const ctx = mem.recall('agent-1', 'user-1', 'typescript deployment', {
  maxItems: 20,              // max total results across all collections (default: 20)
  maxChars: 8000,            // max total chars in formatted output (default: 8000)
  includeProfile: true,      // include user profile (default: true)
  includeSharedSkills: true,  // include _shared skills (default: true)
  includeSharedKnowledge: true, // include _shared knowledge (default: true)
  collections: ['memories', 'skills', 'knowledge'], // which collections to query
});

// ctx.formatted — ready-to-use string with ## sections for each collection
// ctx.memories, ctx.skills, ctx.knowledge — raw SearchResult arrays
// ctx.profile — Profile | null
// ctx.totalItems, ctx.estimatedChars — stats
```

#### Events

Subscribe to typed events for entity lifecycle hooks:

```ts
mem.on('entity:save', ({ entity, commit }) => {
  console.log(`Saved ${entity.type} ${entity.id} at commit ${commit.hash}`);
});

mem.on('entity:update', ({ entity, commit }) => { /* ... */ });
mem.on('entity:delete', ({ entityId, entityType, commit }) => { /* ... */ });
mem.on('session:mined', ({ sessionId }) => { /* ... */ });
mem.on('session:automine:error', ({ sessionId, error }) => { /* ... */ });
mem.on('consolidation:done', ({ type, agentId }) => { /* ... */ });

// Remove listener
mem.off('entity:save', handler);
```

#### Cleanup

Remove stale entities by age, with optional audit log rotation:

```ts
// Remove memories/skills/knowledge older than 90 days
const report = mem.cleanup({ maxAgeDays: 90 });
// { removed: 3, preserved: 42, auditRotated: false, details: [...] }

// Dry run — see what would be removed without deleting
const preview = mem.cleanup({ maxAgeDays: 90, dryRun: true });

// Also rotate audit log to keep last 1000 entries
mem.cleanup({ maxAgeDays: 90, maxAuditLines: 1000 });
```

#### Middleware

Register hooks to intercept save/update/delete operations for validation, transformation, or vetoing:

```ts
mem.use({
  // Transform entity before save — return null to cancel
  beforeSave(entity) {
    if ('tags' in entity) {
      return { ...entity, tags: entity.tags.map(t => t.toLowerCase()) };
    }
    return entity;
  },
  // Transform updates before update — return null to cancel
  beforeUpdate(entity, updates) {
    if (entity.tags?.includes('locked')) return null; // prevent updating locked entities
    return updates;
  },
  // Return false to prevent deletion
  beforeDelete(entityId, entityType) {
    return entityType !== 'profile'; // protect profiles
  },
});
```

Multiple middleware run in registration order. `saveMany` skips cancelled items silently; `deleteMany` skips vetoed items.

#### Export / Import

Portable JSON serialization for backup, migration, or cloning:

```ts
// Export all live entities + access counts
const data = mem.export();
// { version: 1, exportedAt: '...', entities: { memories, skills, ... }, accessCounts: {...} }

// Import into another instance (preserves original IDs)
const report = mem.import(data);
// { imported: 42, skipped: 0, overwritten: 0, byType: { memories: 10, skills: 5, ... } }

// Merge mode — skip entities that already exist
mem.import(data, { skipExisting: true });
```

#### Snapshots

Snapshots create a full point-in-time copy (objects, commits, refs, indices):

```ts
const snap = mem.snapshot('before-migration');
mem.listSnapshots();
mem.restore(snap.id);
```

#### Integrity

```ts
const result = mem.verify();
// { valid: true, totalObjects: 42, totalCommits: 38, errors: [] }

const stats = mem.stats();
// { memories: 15, skills: 3, knowledge: 8, sessions: 5, profiles: 2, objects: 42, commits: 38,
//   index: { scopes: 4, totalDocuments: 26, scopeDetails: [...] } }
```

#### AI Integration (optional)

AI features require a provider. The core library works 100% without AI.

```ts
import { RepoMemory } from '@rckflr/repomemory';
import { OllamaProvider } from '@rckflr/repomemory/ai';

const mem = new RepoMemory({
  dir: '.repomemory',
  ai: new OllamaProvider({ model: 'llama3.1' }),
});

// Mine a session — extracts memories, skills, and profile updates
const mined = await mem.mine('session-id');
// { sessionId, memories: [...], skills: [...], profile: {...} }

// Consolidate memories — merges duplicates, removes outdated
const report = await mem.consolidate('agent-1', 'user-1');
// { agentId, userId, merged: 3, removed: 1, kept: 12 }

// Consolidate skills (agent-scoped, no userId)
const skillReport = await mem.consolidateSkills('agent-1');
// { agentId, merged: 2, removed: 0, kept: 5 }

// Consolidate knowledge (agent-scoped, no userId)
const knowledgeReport = await mem.consolidateKnowledge('agent-1');
// { agentId, merged: 1, removed: 1, kept: 8 }
```

##### Auto-Mining

When `autoMine: true` is set, RepoMemory automatically mines every session when it's saved — no manual `mine()` call needed:

```ts
const mem = new RepoMemory({
  dir: '.repomemory',
  ai: new OllamaProvider({ model: 'llama3.1' }),
  autoMine: true,
});

// This save triggers mining automatically in the background
mem.sessions.save('agent-1', 'user-1', {
  content: 'User: How do I deploy?\nAssistant: Run docker compose up.',
});

// Listen for auto-mine errors (mining is fire-and-forget)
mem.on('session:automine:error', ({ sessionId, error }) => {
  console.error(`Auto-mine failed for ${sessionId}: ${error}`);
});
```

##### Compact Prompts

For small reasoning models (<3B params like Qwen 3.5 0.8B), compact prompts use shorter system messages and one-shot examples to save context window:

```ts
const mem = new RepoMemory({
  dir: '.repomemory',
  ai: new OllamaProvider({ model: 'qwen3:0.6b' }),
  compactPrompts: true,  // force compact prompts
});
```

By default, `compactPrompts` is auto-detected: `true` for Ollama providers, `false` for OpenAI/Anthropic. Set it explicitly to override.

##### Available Providers

```ts
import { OllamaProvider, OpenAiProvider, AnthropicProvider } from '@rckflr/repomemory/ai';

new OllamaProvider({ model: 'llama3.1', baseUrl: 'http://localhost:11434', timeoutMs: 120_000 });
new OpenAiProvider({ apiKey: '...', model: 'gpt-4o-mini', baseUrl: 'http://localhost:8080/v1', timeoutMs: 120_000 });
// OpenAiProvider also reads OPENAI_API_KEY and OPENAI_BASE_URL env vars as fallbacks
new AnthropicProvider({ apiKey: '...', model: 'claude-sonnet-4-20250514', timeoutMs: 120_000 }); // or ANTHROPIC_API_KEY env
```

##### Custom Provider

```ts
import type { AiProvider, AiMessage } from '@rckflr/repomemory';

class MyProvider implements AiProvider {
  async chat(messages: AiMessage[]): Promise<string> {
    // Call your LLM here
    return '...';
  }
}
```

#### RAG Pipeline (document ingestion & retrieval)

The RAG module ingests documents from disk, chunks them, stores as Knowledge entities, and enables retrieval with optional AI-generated answers. No embeddings needed — it reuses the existing TF-IDF search.

```ts
import { RepoMemory } from '@rckflr/repomemory';

const mem = new RepoMemory({ dir: '.repomemory' });

// Ingest a file or directory
const ingestResult = await mem.ragIngest('./docs', 'agent-1', {
  chunkSize: 1000,       // optional (default: 1000 chars)
  overlap: 200,          // optional (default: 200 chars)
  strategy: 'markdown',  // optional: 'fixed' | 'paragraph' | 'markdown' (auto-detected)
});
// { filesProcessed: 5, chunksIngested: 42, chunksCreated: 42, chunksDeduplicated: 0, skipped: [] }

// Query (without AI — returns matching chunks)
const queryResult = await mem.ragQuery('agent-1', 'how to deploy');
// { chunks: [...], context: '...', chunksUsed: 5, answer: null }

// Query with AI (generates answer from context)
import { OllamaProvider } from '@rckflr/repomemory/ai';
const memAi = new RepoMemory({
  dir: '.repomemory',
  ai: new OllamaProvider({ model: 'llama3.1' }),
});
const aiResult = await memAi.ragQuery('agent-1', 'how to deploy', { limit: 10 });
// { chunks: [...], context: '...', chunksUsed: 5, answer: 'To deploy, run...' }

// Sync — detect changes and re-ingest only modified/new files
const syncResult = await mem.ragSync('./docs', 'agent-1');
// { unchangedFiles: 3, modifiedFiles: 1, newFiles: 1, deletedFiles: 0, chunksCreated: 8, chunksRemoved: 5 }
```

You can also use the `RagPipeline` class directly:

```ts
import { RagPipeline } from '@rckflr/repomemory/rag';

const rag = new RagPipeline(mem, { chunkSize: 500, strategy: 'paragraph' });
await rag.ingest('./docs', { agent: 'agent-1' });
const result = await rag.query('agent-1', 'search query');
await rag.sync('./docs', { agent: 'agent-1' });
```

**Chunking strategies:**
- `fixed` — sliding window with overlap (best for code)
- `paragraph` — splits on double newlines (best for prose)
- `markdown` — splits on headings `# ... ######` (best for `.md` files)

Strategy is auto-detected from file extension when not specified.

**Supported file types:** `.md .txt .ts .js .json .py .html .css`

## CLI Reference

All commands accept `--dir <path>` to specify the storage directory (default: `.repomemory`).

### Data management

| Command | Description |
|---------|-------------|
| `repomemory init` | Initialize storage directory |
| `repomemory save <type> --agent <id> [--user <id>] --content <text> [--tags t1,t2] [--category ...]` | Save a memory, skill, knowledge, or profile |
| `repomemory save session --agent <id> --user <id> --file <path>` | Save a session transcript from file |
| `repomemory get <entityId>` | Fetch any entity by ID |
| `repomemory list <type> --agent <id> [--user <id>]` | List all entities of a type |
| `repomemory search <query> --agent <id> [--user <id>] [--type memories] [--limit 5]` | TF-IDF search across a collection |
| `repomemory recall <query> --agent <id> --user <id> [--max-items 20] [--max-chars 8000]` | Retrieve formatted context for LLM prompts (all collections pooled by score) |
| `repomemory history <entityId>` | Full commit history for an entity (including after deletion) |

### AI pipelines

| Command | Description |
|---------|-------------|
| `repomemory mine <sessionId> [--provider ollama] [--model <name>] [--base-url <url>]` | Extract memories, skills, and profile from a session using AI |
| `repomemory consolidate --agent <id> [--user <id>] [--type memories] [--provider ollama] [--model <name>]` | Merge duplicate/similar entities using AI (chunks of 20, keep/merge/remove plan) |

Providers: `ollama` (default), `openai`, `anthropic`, `cloudflare`. The `--base-url` flag works with any OpenAI-compatible endpoint (llama.cpp, vLLM, LM Studio).

### RAG (document ingestion)

| Command | Description |
|---------|-------------|
| `repomemory rag ingest <path> --agent <id> [--chunk-size 1000] [--overlap 200] [--strategy markdown]` | Ingest documents (strategies: `fixed`, `paragraph`, `markdown`) |
| `repomemory rag query <query> --agent <id> [--limit 10] [--provider ollama]` | Query knowledge base with optional AI-generated answer |
| `repomemory rag sync <path> --agent <id>` | Incremental sync — detects adds/deletes/modifications via SHA-256 |
| `repomemory rag status --agent <id>` | Show RAG stats (total knowledge, chunks, unique sources) |

### Administration

| Command | Description |
|---------|-------------|
| `repomemory snapshot create [label]` | Create a point-in-time snapshot of all data |
| `repomemory snapshot list` | List all snapshots |
| `repomemory snapshot restore <id>` | Restore from a snapshot |
| `repomemory export <file.json>` | Export all entities + access counts to portable JSON |
| `repomemory import <file.json> [--skip-existing]` | Import entities from JSON (with dedup validation) |
| `repomemory cleanup [--max-age 90] [--max-audit 10000] [--dry-run]` | Remove stale entities by age, rotate audit log |
| `repomemory stats` | Show storage statistics |
| `repomemory verify` | Verify storage integrity (hash validation of objects and commits) |

## MCP Server

RepoMemory includes a built-in [Model Context Protocol](https://modelcontextprotocol.io) server for LLM tool-use integrations. The server communicates via JSON-RPC 2.0 over stdio with Content-Length framing.

### Running the MCP server

```bash
repomemory-mcp --dir .repomemory
```

### Configuring in your MCP client

Add to your MCP client configuration (e.g., Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "repomemory": {
      "command": "npx",
      "args": ["repomemory-mcp", "--dir", "/path/to/.repomemory"]
    }
  }
}
```

### Available Tools (34)

| Tool | Description |
|------|-------------|
| `memory_save` | Save a new memory |
| `memory_search` | Search memories by text query |
| `memory_save_or_update` | Save or update (dedup) a memory |
| `memory_list` | List all memories for agent/user |
| `skill_save` | Save a new skill |
| `skill_search` | Search skills by text query |
| `skill_save_or_update` | Save or update (dedup) a skill |
| `knowledge_save` | Save a knowledge entry |
| `knowledge_search` | Search knowledge by text query |
| `knowledge_save_or_update` | Save or update (dedup) knowledge |
| `session_save` | Save a session transcript |
| `session_list` | List sessions for agent/user |
| `profile_save` | Save or update a user profile |
| `profile_get` | Get a user's profile |
| `recall` | Multi-collection context retrieval for LLM prompts |
| `entity_get` | Get any entity by ID |
| `entity_delete` | Delete any entity by ID |
| `entity_history` | Get commit history for an entity |
| `mine` | Extract memories/skills/profile from a session (requires AI provider) |
| `stats` | Get storage statistics |
| `verify` | Run integrity check |
| `rag_ingest` | Ingest a file or directory into RAG knowledge |
| `rag_query` | Query RAG knowledge with optional AI answer |
| `rag_sync` | Sync a directory (detect changes, re-ingest) |
| `rag_status` | Show RAG stats for an agent |
| `neural_status` | Check neural engine status and stats |
| `neural_index` | Trigger neural indexing for a scope |
| `neural_search` | Semantic search via embeddings |
| `neural_similarity` | Find similar entities by ID |
| `memory_correct` | Save a correction that overrides incorrect memories |
| `recall_templates` | List available prompt templates |
| `ctt_metrics` | Get CTT quality metrics per agent |
| `export` | Export all entities as portable JSON |
| `import` | Import entities from export payload |

## HTTP API

Lightweight REST server for language-agnostic integrations. Uses the same tool set as MCP.

### Running the HTTP server

```bash
repomemory-http --dir .repomemory --port 3210
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (`{ status: "ok" }`) |
| `GET` | `/tools` | List all available tools |
| `POST` | `/tool/<name>` | Call a tool with JSON body as arguments |

### Example

```bash
# Save a memory
curl -X POST http://localhost:3210/tool/memory_save \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"a1","userId":"u1","content":"Prefers dark mode","tags":["ui"]}'

# Search
curl -X POST http://localhost:3210/tool/memory_search \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"a1","userId":"u1","query":"dark mode","limit":5}'

# Stats
curl -X POST http://localhost:3210/tool/stats -d '{}'
```

CORS is enabled by default (`Access-Control-Allow-Origin: *`).

## Context-Time Training (CTT)

CTT trains the agent, not the model. The model stays frozen — what evolves is the agent's accumulated knowledge, extracted from experience through mining, consolidated over time, and corrected when wrong.

The key distinction: **model** = stateless reasoning engine (replaceable). **Agent** = model + memory + recall (persistent, evolves, learns). Fine-tuning changes model weights; CTT builds the agent's knowledge base. A trained agent with a small model outperforms an untrained agent with a large one.

### How it works

```
Fine-tuning:   data → train model → deploy new weights     (model learns)
CTT:           experience → mine → recall → inject context  (agent learns)
```

The agent learning cycle:

1. **Accumulation** — the agent saves session transcripts from interactions (raw experience)
2. **Extraction** — mining distills sessions into structured memories, skills, and user profiles
3. **Consolidation** — duplicate/overlapping knowledge is merged; conflicts are resolved
4. **Correction** — incorrect information is overridden via correction boost (2x multiplier)
5. **Recall** — on each query, the most relevant knowledge is scored, selected, and injected into the frozen model's context

This mirrors human learning: you don't rewire your neurons for each new task — you store experiences, extract patterns, consolidate during sleep, and recall relevant knowledge when needed. The hardware (brain/model) stays the same; what changes is the accumulated expertise.

### Why train the agent, not the model

| | Fine-tuning (model training) | CTT (agent training) |
|--|------------------------------|----------------------|
| What changes | Model weights | Agent's knowledge base |
| Persistence | Baked into weights | External storage (RepoMemory) |
| Reversibility | Hard (need original weights) | Trivial (delete/correct memories) |
| Transferability | Model-specific | Model-agnostic — swap LLMs freely |
| Learning speed | Hours/days of GPU time | Real-time (every interaction) |
| Auditability | Black box | Full commit history per entity |
| Correctability | Retrain from scratch | Correction boost overrides errors |
| Cost | GPU hours, training data prep | Zero (just disk storage) |
| Portability | Export entire model | `repomemory export` → JSON file |

### Mining and consolidation

The seed phase above happens through two AI-driven pipelines:

**Mining** extracts structured knowledge from raw session transcripts:

```
session transcript → AI extraction → memories[] + skills[] + profile
```

```ts
// Programmatic
const result = await mem.mine('session-id');
// result: { sessionId, memories: [...], skills: [...], profile: {...} }

// CLI
repomemory mine <sessionId> --provider ollama --model llama3.1

// Automatic (on every session save)
const mem = new RepoMemory({
  dir: '.repomemory',
  ai: new OllamaProvider({ model: 'llama3.1' }),
  autoMine: true,  // fires mining asynchronously after each session.save()
});
```

AutoMine emits events for integration: `session:mined` on success, `session:automine:error` on failure.

**Consolidation** merges duplicate and overlapping entities using AI:

```
all entities (chunked by 20) → AI plan (keep/merge/remove) → apply mutations
```

```ts
// Programmatic
const report = await mem.consolidate('agent-1', 'user-1', 'memories');
// report: { merged: 5, removed: 3, kept: 12 }

// CLI
repomemory consolidate --agent agent-1 --user user-1 --type memories --provider ollama
```

Consolidation is idempotent — uses `saveOrUpdate()` internally, so repeated runs produce the same result. Supports memories, skills, and knowledge collections independently.

### Correction boost

Save corrections to override incorrect information:

```ts
// Via library
mem.memories.save('agent-1', 'user-1', {
  content: 'The API rate limit is 1000/min, not 100/min as previously stated',
  tags: ['api', 'rate-limit'],
  category: 'correction',   // 2x scoring multiplier
});

// Via MCP tool
// memory_correct { agentId, userId, original, correction, tags }
```

Corrections receive a 2x scoring boost and are formatted with a `[CORRECTION]` prefix in recall output, ensuring they surface above the original incorrect information.

### Prompt templates

Templates control how recalled context is structured for the LLM:

| Template | Section order | Use case |
|----------|--------------|----------|
| `default` | profile → memories → skills → knowledge | General purpose |
| `technical` | profile → skills → knowledge → memories | Code & architecture (skills 1.5x, knowledge 1.3x) |
| `support` | profile → memories → knowledge → skills | Customer support (memories 1.5x, knowledge 1.2x) |
| `rag_focused` | knowledge → profile → memories → skills | Document Q&A (knowledge 2.0x) |

```ts
// Use a template via recall
const context = mem.recall('agent-1', 'user-1', 'how do I deploy?', {
  template: 'technical',
  maxChars: 4000,
});
```

### CTT metrics

Track recall effectiveness per agent per day:

```ts
// Via MCP tool: ctt_metrics { agentId, days? }
// Returns:
{
  trend: [
    { period: '2026-03-09', recallCalls: 42, hitRate: 0.85, avgItems: 3.2, avgTopScore: 0.72 }
  ],
  summary: { totalCalls: 42, hitRate: 0.85, avgItems: 3.2, avgTopScore: 0.72, totalCorrections: 3 }
}
```

Metrics are stored as lightweight JSON files in `{dir}/metrics/` — no entity/commit overhead.

### Benchmark: trained vs untrained agents

The benchmark measures the same frozen model with and without agent training (accumulated knowledge). "Untrained" = fresh agent with no memories. "Trained" = agent seeded with domain-specific memories, skills, and knowledge via RepoMemory.

Tested across 10 models and 3 knowledge domains (TechStartup, API Design, Customer Support):

**Cloud models (Cloudflare Workers AI):**

| Model | Params | Untrained | Trained | Improvement |
|-------|--------|-----------|---------|-------------|
| Qwen3-30B-A3B (MOE) | 30B (3B active) | 40% | 78% | +101% |
| Mistral 7B v0.1 | 7B | 30% | 76% | +209% |
| Granite 4.0-H-Micro | 8B | 21% | 74% | +333% |
| Llama-2 7B FP16 | 7B | 24% | 70% | +370% |
| Llama-3.1 8B | 8B | 27% | 69% | +282% |
| Llama-2 7B INT8 | 7B | 29% | 69% | +170% |
| GLM-4.7-Flash | 7B | 37% | 62% | +71% |
| GPT-OSS-20B | 20B | 27% | 60% | +160% |

**Sub-1B models (Ollama, CPU-only VPS):**

| Model | Params | Untrained | Trained | Improvement |
|-------|--------|-----------|---------|-------------|
| Qwen3 0.6B | 600M | 25% | 65% | +211% |
| Gemma3 270M | 270M | 22% | 41% | +106% |

**Summary:**

| Metric | Value |
|--------|-------|
| Average untrained score | 28% |
| Average trained score | 66% |
| Average improvement | **+202%** |
| Best single result | +800% (Llama-2 7B FP16 on API Design) |
| Best trained agent | Qwen3-30B-A3B at 78% |

**Key findings:**
- A trained agent improves **every model** across **every domain** — no exceptions
- A trained Qwen3 0.6B agent (65%) outperforms untrained 7B-20B agents (21-40%) — agent training compensates for model size
- Even the smallest model (Gemma3 270M) benefits significantly from training (+106%)
- The agent's knowledge is model-agnostic: the same RepoMemory data works with any LLM
- Sub-1B trained agents run entirely on CPU with sub-15s latency — viable for edge/on-device deployment
- The API Design domain shows the biggest training impact because untrained agents have zero domain-specific knowledge

Run the benchmark yourself:

```bash
# Cloudflare Workers AI (8 models)
CLOUDFLARE_ACCOUNT_ID=xxx CLOUDFLARE_API_TOKEN=yyy npx vitest run tests/ctt-benchmark

# Ollama (sub-1B local/VPS)
OLLAMA_BASE_URL=http://localhost:11434 node tests/ctt-benchmark/run-ollama-benchmark.mjs gemma3:270m qwen3:0.6b
```

## Architecture

### Storage Layout

```
.repomemory/
  VERSION                          # "2"
  objects/                         # Content-addressable blobs
    ab/cd1234...sha256.json        # { type, data }
  commits/                         # Immutable commit chain per entity
    ab/cd1234...sha256.json        # { hash, parent, objectHash, timestamp, author, message }
  refs/                            # Pointers to latest commit
    memories/{agentId}/{userId}/{entityId}.ref
    skills/{agentId}/{entityId}.ref
    knowledge/{agentId}/{entityId}.ref
    sessions/{agentId}/{userId}/{entityId}.ref
    profiles/{agentId}/{userId}.ref
  index/
    tfidf/                         # Serialized TF-IDF indices per scope
    lookup/                        # id -> refPath mappings (URI-encoded filenames)
    access-counts.json             # Access count side-index
  snapshots/                       # Point-in-time snapshots (full copy)
  log/operations.jsonl             # Append-only audit log
```

### How a save works

1. Filesystem lock acquired (if `lockEnabled`)
2. Entity data -> `objectHash = sha256(serialized)` -> written to `objects/`
3. Existing ref read to get `parentHash`
4. Commit created: `{ parent, objectHash, timestamp, author, message }` -> written to `commits/`
5. Ref updated to point to new commit
6. Lookup index and TF-IDF index updated incrementally
7. Operation appended to audit log
8. Lock released

Deletes create a tombstone commit (`objectHash: "TOMBSTONE"`). The ref points to the tombstone commit and the full commit chain is preserved, so `history()` works after deletion.

### Component Diagram

```
RepoMemory (facade)
|
+-- Storage Layer
|   +-- ObjectStore        Content-addressable SHA-256 blobs (2-char prefix dirs)
|   +-- CommitStore        Immutable linked list of commits per entity
|   +-- RefStore           HEAD pointers: ref -> latest commit hash
|   +-- LookupIndex        Global entityId -> refPath reverse index
|   +-- AccessTracker      Access counts per entity (no commits, side-index)
|   +-- AuditLog           Append-only operation log (JSONL) with rotate()
|   +-- SnapshotManager    Full point-in-time backups
|   +-- LockGuard          Filesystem-based mutex wrapping save/delete (mkdir atomic + stale detection)
|
+-- Search Layer
|   +-- SearchEngine       Scoped TF-IDF indices, persisted to disk, with indexStats() diagnostics
|   +-- TfIdfIndex         Term frequency-inverse document frequency with serialization
|   +-- Tokenizer          Word tokenization with Porter stemming + stopwords (EN + ES)
|   +-- Stemmer            Porter 1980 English stemmer (zero deps)
|   +-- QueryExpander      Synonym/abbreviation expansion (tech-focused: ts->typescript, k8s->kubernetes, etc.)
|   +-- Scoring            Configurable composite: TF-IDF + Jaccard tags + decay + capped access boost
|
+-- Recall Layer
|   +-- RecallEngine       Score-based multi-collection query with budget-aware formatting + access tracking
|   +-- RecallFormatter    Structured text output for LLM system prompts
|
+-- Collections (typed CRUD facades)
|   +-- MemoryCollection     facts, decisions, issues, tasks (+ saveOrUpdate dedup)
|   +-- SkillCollection      procedures, config, troubleshooting, workflows (+ saveOrUpdate dedup)
|   +-- KnowledgeCollection  source, chunks, versions, questions (+ saveOrUpdate dedup)
|   +-- BaseCollection       save/get/update/delete/list/listPaginated/count/deleteMany/saveMany
|   +-- SessionCollection  conversations, structured messages, mined flag
|   +-- ProfileCollection  per agent/user profiles with metadata
|
+-- Event System
|   +-- RepoMemoryEventBus  Typed EventEmitter wrapper with try-catch protection (entity:save/update/delete, session:mined, session:automine:error, consolidation:done)
|
+-- Cleanup
|   +-- runCleanup          TTL-based entity removal with dry-run and audit rotation
|
+-- RAG Pipeline (sub-export: repomemory/rag, lazy-loaded)
|   +-- RagPipeline         Facade: ingest, query, sync
|   +-- Chunker             3 strategies: fixed (sliding window), paragraph, markdown (headers)
|   +-- Loader              Load files/directories with extension filter + size/depth limits
|   +-- Ingest              Load → chunk → saveOrUpdate as Knowledge with source/version/hash
|   +-- Query               Search chunks → build context → optional AI answer generation
|   +-- Sync                Hash-based change detection: unchanged/modified/new/deleted
|
+-- AI Pipelines (optional, lazy-loaded)
|   +-- MiningPipeline              Extract memories + skills + profile from session (structured messages aware)
|   +-- ConsolidationPipeline       Merge/dedup memories by category (chunks of 20)
|   +-- SkillConsolidationPipeline  Merge/dedup skills by category
|   +-- KnowledgeConsolidationPipeline  Merge/dedup knowledge items
|   +-- AiService                   Schema-validated JSON parsing with retry
|
+-- AI Providers (sub-export: repomemory/ai)
|   +-- OllamaProvider     Local Ollama (default: llama3.1)
|   +-- OpenAiProvider     OpenAI API (default: gpt-4o-mini)
|   +-- AnthropicProvider  Anthropic Messages API (default: claude-sonnet-4-20250514)
|
+-- Middleware
|   +-- MiddlewareChain    Ordered pipeline: beforeSave, beforeUpdate, beforeDelete hooks
|
+-- Scoping (src/scoping.ts)
|   +-- scopeFromEntity      Build scope string from entity fields
|   +-- scopeFromParts       Build scope string from type/agentId/userId
|   +-- refBaseFromEntity    Build ref path prefix from entity
|
+-- Portability
|   +-- exportData         Collect all live entities + access counts as portable JSON
|   +-- importData         Restore entities preserving IDs, re-index, restore access counts
|
+-- MCP Server (bin: repomemory-mcp)
|   +-- handler.ts         Protocol logic: 34 tools, JSON-RPC dispatch (testable independently)
|   +-- mcp.ts             Stdio transport: Content-Length framing, buffer parsing
|
+-- HTTP Server (bin: repomemory-http)
    +-- http.ts            REST API over node:http, reuses MCP handler, CORS enabled
```

### Search Pipeline

Queries pass through a multi-stage pipeline before scoring:

1. **Query expansion** — synonyms/abbreviations added (e.g., "ts" adds "typescript", "db" adds "database")
2. **Tokenization** — lowercase, punctuation removal, stopword filtering (EN + ES)
3. **Porter stemming** — reduces words to root form ("running" -> "run", "configurations" -> "configur")
4. **TF-IDF scoring** — term frequency-inverse document frequency against indexed entities
5. **Composite scoring** — combines TF-IDF with tag overlap, decay, and access boost

### Search Scoring

```
finalScore  = base * correctionBoost        (if category = 'correction', else base)
base        = relevance * decay * accessBoost

relevance   = tfidfScore * normTfidf + tagOverlap * normTag + embeddingScore * normEmb

            where normX = weightX / (tfidfWeight + tagWeight + embeddingWeight)
            (weights are normalized to sum to 1.0)

tagOverlap  = |intersection| / |union|     (Jaccard similarity, case-insensitive)
decay       = max(0.01, e^(-decayRate * daysSinceUpdate))    (floor at 1% relevance)
accessBoost = min(log₂(2 + accessCount), maxAccessBoost)
```

**Default weights:**

| Weight | Default | Notes |
|--------|---------|-------|
| `tfidfWeight` | 0.7 | TF-IDF lexical relevance |
| `tagWeight` | 0.3 | Jaccard tag overlap |
| `embeddingWeight` | 0 | Cosine similarity (neural). Set to 0.4 when neural is active |
| `decayRate` | 0.005 | Exponential decay per day. 0 = no decay |
| `maxAccessBoost` | 5.0 | Cap on popularity multiplier |
| `correctionBoost` | 2.0 | Multiplier for `correction` category memories |

When `embeddingWeight=0` (default), the formula is mathematically identical to pre-neural behavior: `relevance = tfidfScore * 0.7 + tagOverlap * 0.3`.

### Hybrid Search (Neural + Lexical)

When neural search is enabled (`neural: { enabled: true }`), the system operates in two complementary modes:

**1. Composite scoring** — `embeddingWeight` adds cosine similarity to the relevance formula above. Weights are automatically re-normalized (e.g., `tfidf=0.7, tag=0.3, embedding=0.4` normalizes to `0.5, 0.21, 0.29`).

**2. Pure neural ranking** — The `neural_search` MCP tool bypasses TF-IDF entirely and returns results ranked solely by cosine similarity via Matryoshka 3-level pyramid:
- **Level 1**: 128-dim coarse scan → top 50 candidates
- **Level 2**: 256-dim re-rank → top 15 candidates
- **Level 3**: 768-dim precise ranking → top N results

This cascade eliminates ~83% of candidates at the cheapest level, achieving ~6x speedup over full-dimension brute force.

**MMR diversity filtering** — `ContextCurator` applies Maximal Marginal Relevance (lambda=0.7) to prevent near-duplicate items: `mmrScore = 0.7 * relevance - 0.3 * maxSimilarityToSelected`. Items with similarity > 0.85 to already-selected results are suppressed.

The TF-IDF index is cached to disk and updated incrementally — no full rebuild on each search. Neural embeddings are stored as binary Float32 arrays (3KB per entity) and indexed fire-and-forget on save.

**Note:** The combined score is not normalized to [0, 1]. TF-IDF values depend on corpus size and term distribution, and `accessBoost` amplifies the score further. Keep this in mind when setting absolute thresholds (e.g., dedup uses 0.2).

### Recall Budget Allocation

`recall()` uses a **score-based budget** instead of splitting equally across collections. All candidates from memories, skills, and knowledge are pooled and sorted by composite score. The top `maxItems` results are selected regardless of which collection they came from. This means if your query matches 10 memories strongly but no skills, you get 10 memories (not 3+3+3).

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| Content-addressable storage | Automatic dedup, integrity verification via hash |
| Tombstone deletes | Preserve full history; `history()` works after deletion |
| Scoped TF-IDF indices | Each `type:agentId:userId` scope has its own index for fast, isolated search |
| URI-encoded lookup filenames | Cross-platform safety (`:` is invalid on Windows) |
| Lazy-loaded AI pipelines | Core library works with zero cost when AI is not used |
| Consolidation chunks of 20 | Keeps LLM context windows manageable |
| Access count as side-index | Reads don't create commits (audit-free popularity tracking) |
| Budget-aware recall formatter | Fits context into LLM token limits without cutting items mid-text |
| Porter stemming in tokenizer | "running" matches "run" — biggest search quality win without embeddings |
| Query expansion (synonym map) | "ts config" finds "TypeScript configuration" — covers common dev abbreviations |
| Configurable scoring weights | Tune TF-IDF/tag balance, decay rate, and access boost cap per deployment |
| Score-based recall budget | Best results win regardless of collection — no wasted slots on low-quality matches |
| Capped access boost (default 5x) | Prevents runaway popularity; old frequently-accessed items don't dominate forever |
| Typed event bus with try-catch | Type-safe hooks without coupling consumers to internals; handler errors never crash core ops |
| Strict schema validators on AI output | Catch malformed LLM responses before they corrupt storage; validates content, tags, categories |
| mkdir-based file locking on save/delete | Atomic on all platforms; stale lock detection via mtime; wraps every write operation |
| Middleware chain with cancel semantics | beforeSave returns null to cancel; saveMany skips silently, single save throws — consistent UX |
| Export preserves entity IDs | Import into another instance maintains references (e.g., sourceSession links) |
| HTTP reuses MCP handler | Single source of truth for tool dispatch; HTTP is just a transport wrapper |
| Deferred flush (search boundary) | Individual save/update/delete skip disk flush; flush happens before search and on batch boundaries — ~80% I/O reduction with zero consistency loss |
| Eager LookupIndex loading | All scopes loaded into memory on `init()` for O(1) `findById()` — eliminates O(n) fallback scan across scope files |
| IDF pre-computation on deserialize | `recomputeIdf()` called when TF-IDF index is loaded from disk — avoids marking index dirty and redundant recomputation on first search |
| Shared scoping utility | `src/scoping.ts` centralizes scope/ref-path construction — eliminates 4x duplication across engine, portability, and collections |
| Underscore encoding in scope cache | `_` is URI-safe so `encodeURIComponent` preserves it — breaks segment boundaries when used as join separator. Manual `%5F` encoding fixes collisions |
| 1 MB content limit | Prevents DoS via oversized entities without rejecting legitimate large content (code files, long docs) |
| Bounded scans with configurable limits | `MAX_SCAN=5000` in listConversations, `maxResults=10000` in prefix scan, `limit=50` in cross-agent profiles — prevents OOM without sacrificing normal-use coverage |
| Input ID validation | Rejects `/`, `\`, `:`, `\0`, `..` in entity/agent/user IDs — prevents path traversal via crafted IDs stored as ref paths |
| RAG without embeddings | TF-IDF + chunking is sufficient for document Q&A when corpus is small-to-medium; avoids vector DB dependency |
| SHA-256 chunk versioning | Each chunk's hash is stored as `version` — sync compares hashes to detect modifications without re-reading all stored entities |
| Auto-detected chunk strategy | File extension determines chunking: `.md` → markdown, code → fixed, prose → paragraph — sensible defaults without config |
| RAG as sub-export | `@rckflr/repomemory/rag` is tree-shakeable; core library size unaffected for users who don't need RAG |
| CTT over fine-tuning | Context injection is immediate, reversible, and works with any model. No training data prep, no GPU hours, no model hosting — just recall + inject |
| Correction boost (2x) | Corrections must override stale facts. A 2x multiplier ensures they rank above the original incorrect memory without manual deletion |
| Prompt templates as score multipliers | Templates adjust collection weights externally via score multipliers. No changes to core `computeScore()` — keeps scoring deterministic |
| CTT metrics outside entity system | Metrics are write-heavy counters. Storing them as JSON files in `metrics/` avoids commit chain bloat for high-frequency tracking |
| Neural as optional peer dep | `@huggingface/transformers` adds ~300MB. Optional peer dependency + dynamic `await import()` keeps core install at zero deps |
| Matryoshka pyramid ranking | 3-level cascade (128→256→768 dims) eliminates ~83% of candidates at the cheap 128-dim level. Full 768-dim only runs on finalists |
| Fire-and-forget neural indexing | Embedding latency (~10-50ms) would block synchronous saves. Detached promise keeps save path fast; stale embeddings self-correct on next save |

## Changelog

### v2.16.0

**Context-Time Training (CTT) Framework**

- **CloudflareProvider** (`repomemory/ai`): Dedicated Cloudflare Workers AI provider with OpenAI-compatible endpoints. Supports direct API and AI Gateway URLs. Uses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` env vars.
- **Correction boost**: New `'correction'` memory category with 2x scoring multiplier. Corrections surface above regular memories with `[CORRECTION]` prefix. New MCP tool: `memory_correct`.
- **Prompt templates**: 4 built-in templates (`default`, `technical`, `support`, `rag_focused`) controlling section order, headers, preamble, and per-collection weight multipliers. New MCP tool: `recall_templates`. The `recall` tool now accepts an optional `template` parameter.
- **CTT metrics**: `MetricsTracker` stores per-agent-per-day JSON in `{dir}/metrics/`. Tracks recall calls, hits, items returned, top scores, corrections, mining, unique queries. New MCP tool: `ctt_metrics`.
- **CTT benchmark framework** (`tests/ctt-benchmark/`): Automated benchmark harness comparing base model vs CTT-augmented responses across multiple models and knowledge domains. 3 built-in domains: TechStartup, APIDesign, CustomerSupport.
- **34 MCP tools** total (3 new: `memory_correct`, `recall_templates`, `ctt_metrics`).

### v2.15.0

**Neural Semantic Search**

- **Neural engine module** (`@rckflr/repomemory/neural`): Optional semantic search via EmbeddingGemma-300m (308M params, ONNX q8) through `@huggingface/transformers` peer dependency.
- **Matryoshka 3-level pyramid**: 128-dim coarse scan → 256-dim re-rank → 768-dim precise ranking. ~6x faster than full-dim brute force.
- **Cross-lingual support**: EmbeddingGemma supports 100+ languages. A Spanish memory matches an English query.
- **MMR diversity**: `ContextCurator` applies Maximal Marginal Relevance (lambda=0.7) to prevent near-duplicate context.
- **Fire-and-forget indexing**: `save()`/`update()` trigger embedding computation (~10-50ms) without blocking the sync write path.
- **Binary storage format**: JSON manifest + contiguous Float32 per scope in `index/embeddings/`. LRU eviction (max 50 loaded scopes).
- **4 new MCP tools**: `neural_status`, `neural_index`, `neural_search`, `neural_similarity`.
- **Graceful degradation**: If `@huggingface/transformers` is not installed, all neural features silently degrade — TF-IDF search continues to work.

### v2.14.0

**RAG Pipeline — Document Ingestion & Retrieval**

- **RAG pipeline module** (`@rckflr/repomemory/rag`): Zero-dependency RAG (Retrieval-Augmented Generation) pipeline that reuses existing TF-IDF search and Knowledge storage. No embeddings or vector DB required.
- **3 chunking strategies**: `fixed` (sliding window with overlap), `paragraph` (split on `\n\n`), `markdown` (split on headings `#{1-6}`). Auto-detected from file extension.
- **Document ingestion** (`ragIngest`): Load files or directories from disk, chunk them, and store as Knowledge entities with `source`, `chunkIndex`, and `version` (SHA-256 hash) fields. Deduplicates via `saveOrUpdate()`.
- **RAG query** (`ragQuery`): Search relevant chunks by text query. Optionally generates an AI answer from the retrieved context using any configured provider.
- **Incremental sync** (`ragSync`): Compares file content hashes against stored chunk versions. Only re-ingests modified and new files; removes chunks for deleted files. Skips unchanged files entirely.
- **RagPipeline facade**: `new RagPipeline(mem, config?)` with `ingest()`, `query()`, `sync()` methods.
- **4 new MCP tools**: `rag_ingest`, `rag_query`, `rag_sync`, `rag_status`.
- **4 CLI subcommands**: `rag ingest|query|sync|status` with full flag support.
- **3 facade methods**: `mem.ragIngest()`, `mem.ragQuery()`, `mem.ragSync()` on the main `RepoMemory` class.
- **3 new events**: `rag:ingest:done`, `rag:query:done`, `rag:sync:done`.
- **2 new error codes**: `RAG_LOAD_ERROR`, `RAG_INGEST_ERROR`.
- **New build entry point**: `dist/rag/` with ESM + .d.ts + sourcemaps.
- **Supported file types**: `.md .txt .ts .js .json .py .html .css`. Skips `node_modules`, `.git`, hidden directories. Max depth 10, max file 1 MB.

**Tests**
- Added 59 new tests across 6 files: chunker (19), loader (14), ingest (8), query (7), sync (6), pipeline end-to-end (5). Total: ~414 tests across 36 files.

### v2.13.0

**Security Hardening & Robustness**

- **Timing-safe API key comparison**: HTTP API uses `crypto.timingSafeEqual` to prevent timing attacks on Bearer token authentication.
- **Symlink cycle protection**: `RefStore.walkRefs()` uses `lstatSync` + visited Set + depth cap (20) to prevent infinite recursion on symlink cycles.
- **Broken commit chain resilience**: `history()` returns partial chain instead of crashing when a commit in the chain is missing or corrupted.
- **AI hallucination guard**: Consolidation pipelines validate AI-generated IDs against actual chunk items before executing merges/deletes. Prevents hallucinated IDs from corrupting storage.
- **Query tag stemming**: Query tags are now stemmed with Porter stemmer for consistent tag overlap scoring with entity tags.
- **Atomic audit log rotation**: Uses `atomicWriteFileSync` for audit log rotation with corrupted line filtering.
- **Content-Type validation**: HTTP API returns 415 Unsupported Media Type for non-JSON POST requests.
- **Search limit alignment**: HTTP `/search` endpoint clamped to 200 (matching internal `MAX_SEARCH_LIMIT`).
- **Snapshot metadata validation**: Verifies `snapshot.json` exists and is parseable before destructive restore operations.
- **Stray file robustness**: `listAll()` in ObjectStore and CommitStore skips non-directory entries in prefix directories.
- **Published to npm**: Available as `@rckflr/repomemory` (scoped package).

**Tests**
- Added 23 new tests covering broken chains, tag caps, path traversal, entity type validation, search limits, query stemming, snapshot validation, audit rotation, stray files, symlink protection, stemmer idempotence, and index rebuild. Total: ~355 tests across 30 files.

### v2.12.0

**Robustness & Safety Hardening**

- **Pagination optimization**: `listEntitiesPaginated()` uses a two-pass approach — counts alive entries without loading objects, then loads only the requested page. Prevents OOM on large datasets.
- **Search limit cap**: `find()` and `findMultiScope()` clamp `limit` to `MAX_SEARCH_LIMIT` (200). Prevents DoS via excessive limit values.
- **Entity type validation**: `StorageEngine.validateEntity()` validates entity type against a whitelist. Rejects invalid types before they reach storage.
- **Tags cap**: Entities are limited to 50 tags maximum. Prevents excessive tag counts from degrading search performance.
- **Lookup prefix bounding**: `LookupIndex.listByPrefix()` accepts optional `maxResults` parameter. `listEntitiesByPrefix()` passes a bounded cap to prevent unbounded lookup iteration.
- **Snapshot atomicity**: `SnapshotManager.create()` acquires a `LockGuard` during snapshot creation. Prevents concurrent writes from corrupting snapshots.
- **Truncated conversations flag**: `listConversations()` returns `truncated: true` when the `MAX_SCAN` limit truncates results. Consumers can detect incomplete totals.
- **Session message validation**: MCP `session_save` tool validates `messages[]` structure — each element must have `role` (non-empty string) and `content` (string) fields.
- **Consolidation idempotency**: All consolidation pipelines (`memories`, `skills`, `knowledge`) now use `saveOrUpdate()` instead of plain `save()`. Running consolidation multiple times no longer creates duplicates.
- **Import dedup detection**: `importData()` pre-validates all entities and detects duplicate entity IDs within the import data. Prevents silently overwriting earlier entities in the same import batch.
- **HTTP graceful shutdown**: The HTTP server handles `SIGTERM`/`SIGINT` — flushes pending data, closes connections, exits cleanly with 5-second forced shutdown timeout.
- **Version bumps**: `package.json`, MCP `SERVER_INFO`, HTTP `/health` endpoint all report `2.12.0`.

### v2.11.0

**Scalability & Security Hardening**

- **Scope encoding collision fix**: TF-IDF cache filenames now encode underscores (`_` → `%5F`) within scope segments before joining with `_` separator. Prevents collisions when underscores appear at different positions across segments (e.g., `agent_1:user` vs `agent:1_user`). Includes 3-level legacy fallback (v2.11+ → v2.10.x → pre-v2.10) for seamless migration.
- **Content size limit (1 MB)**: `StorageEngine.validateEntity()` rejects content exceeding 1 MB (`Buffer.byteLength` in UTF-8). Prevents DoS via oversized entities. Applied to all entity types on save.
- **`listConversations()` pagination**: Returns `{ items, total, hasMore }` instead of a flat array. Accepts `{ limit?, offset? }` options. Bounded scan (max 5,000 sessions) prevents OOM on large datasets.
- **`getByUserAcrossAgents()` limit**: Accepts `limit` parameter (default 50) with early break at `limit * 2` candidates. Prevents scanning all profiles in the system.
- **`listEntitiesByPrefix()` bounded scan**: Accepts `maxResults` parameter (default 10,000). Stops scanning once the limit is reached.

**Tests**
- Added 14 new tests: scope encoding collision (2), content size limits (4), conversation pagination (3), profile cross-agent limits (3), prefix scan bounds (2). Total: ~345 tests across 30 files.

### v2.10.0

**Security & Data Integrity**

- **Path traversal prevention**: Entity IDs, agent IDs, and user IDs are validated against illegal characters (`/`, `\`, `:`, `\0`, `..`). Prevents filesystem escape via crafted IDs.
- **Snapshot restore lock**: `restore()` is wrapped in `withLock()` to prevent concurrent restores from corrupting storage.
- **History depth limit**: `commits.history()` has a max depth of 10,000 to prevent infinite loops on corrupted commit chains.
- **Scope encoding per segment**: Search engine encodes each scope segment with `encodeURIComponent` separately before joining, fixing issues with special characters in agent/user IDs.
- **Knowledge dedup source check**: `saveOrUpdate()` on knowledge filters candidates by matching `source` field. Prevents false-positive dedup across different source files.
- **Snapshot staging validation**: `restore()` validates staged snapshots have required directories before overwriting live data.
- **HTTP request size limit**: HTTP API limits request body to 1 MB to prevent memory exhaustion from oversized payloads.
- **LookupIndex rebuild**: New `rebuildLookupIndex()` method recovers from lookup/ref desynchronization caused by crashes mid-write.

**Tests**
- Added security tests (path traversal, restore locks, history depth) and fix validation tests. Total: ~331 tests across 29 files.

### v2.5.1

**Reliability & Performance**

- **AI request timeouts**: All providers (Ollama, OpenAI, Anthropic) now use `AbortController` with configurable `timeoutMs` (default: 120s). Previously, requests could hang indefinitely if the AI server stopped responding.
- **CLI `--base-url` flag**: `mine` and `consolidate` commands now accept `--base-url <url>` for pointing at local/custom AI endpoints (e.g., `--provider openai --base-url http://localhost:8080/v1` for llama.cpp).
- **`OPENAI_BASE_URL` env var**: `OpenAiProvider` now reads `OPENAI_BASE_URL` as a fallback for `baseUrl` config, matching the standard OpenAI SDK convention.
- **Exponential backoff on lock contention**: `LockGuard` replaced busy-wait spin loop with `Atomics.wait()` (zero CPU usage) and exponential backoff with jitter (10ms base, 500ms cap). Reduces CPU waste under contention by ~99%.
- **Skills dedup in mining**: Mining pipeline now uses `saveOrUpdate()` for skills (was `save()`), preventing duplicate skills when re-mining similar sessions.
- **Tag overlap normalization**: `computeTagOverlap()` now normalizes both sides to lowercase before comparison, fixing case-sensitivity mismatches in search scoring.
- **Async atomic write utility**: Added `atomicWriteFile()` (async version) alongside the existing sync `atomicWriteFileSync()`, preparing for future async I/O migration.

### v2.5.0

**MCP Server, HTTP API, Export/Import, Middleware, Auto-Mining & Compact Prompts**

- **MCP server** (`repomemory-mcp`): Full Model Context Protocol server over stdio with Content-Length framed JSON-RPC 2.0. Exposes 23 tools covering all CRUD operations, search, recall, mining, export/import, stats, and integrity verification. Handler logic is separated from transport for testability.
- **HTTP API** (`repomemory-http`): Lightweight REST server using `node:http`. Reuses the MCP handler for all 23 tools. Endpoints: `GET /health`, `GET /tools`, `POST /tool/<name>`. CORS enabled.
- **Export/Import** (`mem.export()`, `mem.import()`): Portable JSON serialization of all entities + access counts. Preserves original IDs on import. Options: `skipExisting` for merge mode. CLI: `repomemory export <file>`, `repomemory import <file> [--skip-existing]`.
- **Middleware pipeline** (`mem.use()`): Register `beforeSave`/`beforeUpdate`/`beforeDelete` hooks for validation, transformation, or vetoing. Chain runs in order, short-circuits on cancel. New error code: `MIDDLEWARE_CANCELLED`.
- **Auto-mining** (`autoMine` config): Sessions automatically mined on save via event bus. Fire-and-forget — errors emit `session:automine:error` instead of crashing. Requires `ai` provider.
- **Configurable compact prompts** (`compactPrompts` config): Explicit control over prompt strategy. Compact prompts use shorter system messages and one-shot examples optimized for small reasoning models (<3B params). Auto-detected by default (true for Ollama, false for OpenAI/Anthropic).
- **CLI commands**: Added `export`, `import`, `recall`, `cleanup` commands (previously library-only).

**Performance Optimizations**
- **Deferred flush**: Individual `save()`/`update()`/`delete()` no longer flush search indices to disk. Flush happens automatically before search operations and at batch boundaries (`saveMany`, `deleteMany`). ~80% I/O reduction for write-heavy workloads.
- **Eager LookupIndex loading**: All scope files loaded into `globalIndex` on `init()`. `findById()` is now always O(1) — eliminates O(n) fallback scan across scope files.
- **IDF pre-computation on deserialize**: TF-IDF index calls `recomputeIdf()` when loaded from disk instead of marking dirty for lazy recomputation.
- **Shared scoping utility** (`src/scoping.ts`): Centralized scope string and ref path construction, eliminating duplicated switch statements across engine, portability, and collections.
- **Specific error catching in consolidation**: Consolidation pipelines now catch only `NOT_FOUND` errors instead of swallowing all exceptions.
- **Helper functions for entity field access**: `entityAgentId()`/`entityUserId()` in base collection replace verbose double-casts.

**Tests**
- Added 78 new tests: MCP handler, auto-mining, portability (13), middleware (15), CLI commands (8), HTTP API (11). Total: ~284 tests across 27 files.

### v2.4.0

**Dedup, Pagination & Bulk Deletes**

- **`saveOrUpdate()` for skills and knowledge**: Skills and knowledge now have deduplication via `saveOrUpdate(agentId, input, threshold?)`. Same pattern as memories: searches for similar content, updates if above threshold, creates new otherwise. Skills match on same category; knowledge matches on score only.
- **Paginated listing**: New `listPaginated(agentId, userId?, { limit?, offset? })` returns `{ items, total, limit, offset, hasMore }`. Default limit is 50. The original `list()` remains for backwards compatibility.
- **`count()`**: New `count(agentId, userId?)` returns total entity count without loading all entities into memory.
- **`deleteMany()`**: New `deleteMany(entityIds)` deletes multiple entities in a single call with one flush. Skips non-existent IDs gracefully. Emits `entity:delete` for each deletion.

**New Types**
- `ListOptions { limit?, offset? }`, `ListResult<T> { items, total, limit, offset, hasMore }`

**Tests**
- Added 19 new tests covering saveOrUpdate for skills/knowledge, pagination, count, and deleteMany (total: 208 tests across 18 files)

### v2.3.0

**Search Quality Improvements** — Major upgrades to the no-embeddings search pipeline.

- **Porter stemmer**: All tokens are now stemmed during indexing and search. "running" matches "run", "configurations" matches "configuration", etc. This is the single biggest search quality improvement for a TF-IDF system without embeddings.
- **Query expansion**: Automatic synonym/abbreviation mapping for technical terms. "ts config" expands to include "typescript", "configuration", "settings". Covers languages (ts/js/py/rb/rs), databases (pg/mongo/redis), devops (k8s/ci/cd), and common dev abbreviations (auth, api, env, deps, etc.). Bidirectional: "typescript" also expands to "ts".
- **Configurable scoring weights**: New `scoring` config option with `tfidfWeight`, `tagWeight`, `decayRate`, and `maxAccessBoost`. Set `decayRate: 0` for no time decay (timeless skills). Default values unchanged from v2.2.x.
- **Access boost cap**: Access boost is now capped at `maxAccessBoost` (default 5.0) to prevent runaway popularity. Previously, a frequently-accessed item could dominate search results indefinitely.
- **Score-based recall budget**: `recall()` now pools all candidates from memories/skills/knowledge, sorts by composite score, and takes the top `maxItems`. Previously it split budget equally across collections, wasting slots when one collection had much better matches.
- **Index diagnostics**: `stats()` now includes `index: { scopes, totalDocuments, scopeDetails }` for monitoring TF-IDF index health.

**Tests**
- Added 21 new tests covering stemmer, query expansion, scoring weights, access boost cap, recall budget, and index stats (total: 189 tests across 17 files)

### v2.2.1

**Bug Fixes**
- **LockGuard wired into StorageEngine**: `save()` and `delete()` are now wrapped in `withLock()` for actual concurrent access protection. Previously, `Lockfile` and `LockGuard` existed but were never used. The `lockEnabled` config option now flows through to the storage engine.
- **Recall access tracking**: `recall()` now increments access counts for all returned entities via `AccessTracker.incrementMany()`. Previously, the access tracking loop was a no-op (empty body).
- **Event emit try-catch**: Event handlers that throw no longer crash core operations (`save`, `update`, `delete`). Errors are caught and swallowed by the event bus.
- **saveMany emits events**: `saveMany()` now fires `entity:save` for each item. Previously, only individual `save()` emitted events.
- **Config rename**: `maxSessionTokens` renamed to `maxSessionChars` for accuracy (it controls character count, not tokens). **Breaking change** for users who set this config option.
- **Score NaN guard**: `daysBetween()` returns 0 instead of NaN when given invalid date strings, preventing NaN scores from propagating through search results.
- **AI validators strengthened**: Mining and consolidation validators now check that tag arrays contain strings, content is non-empty, category is non-empty, merge sourceIds are non-empty strings, and keep/remove arrays contain strings.
- **Lockfile ESM fix**: Replaced `require('node:fs')` calls with top-level ESM imports for compatibility with the project's `"type": "module"` setting.

**Tests**
- Added 10 new tests covering all v2.2.1 fixes (total: 168 tests)

### v2.2.0

**New Features**
- **Recall engine** (`mem.recall()`): Single-call context retrieval across all collections. Budget-aware formatter produces structured text for LLM system prompts with configurable `maxChars` and `maxItems`.
- **Event system** (`mem.on()`/`mem.off()`): Typed event bus with `entity:save`, `entity:update`, `entity:delete`, `session:mined`, and `consolidation:done` events. All collections emit events automatically.
- **Structured sessions**: Sessions now accept an optional `messages[]` array with `{ role, content, timestamp }`. Mining pipeline automatically formats structured messages for AI extraction.
- **TTL cleanup** (`mem.cleanup()`): Remove stale memories/skills/knowledge older than N days. Supports dry-run mode and audit log rotation via `maxAuditLines`.
- **File locking**: `Lockfile` and `LockGuard` classes for filesystem-based mutex with stale lock detection (30s timeout). Available for concurrent access scenarios.
- **Configurable dedup threshold**: `dedupThreshold` config option controls `saveOrUpdate()` similarity sensitivity (default: 0.2).
- **AI response validation**: Schema validators for mining extraction and consolidation plan responses. Automatic retry on malformed AI output before failing.

**New Types**
- `RecallContext`, `RecallOptions`, `CleanupOptions`, `CleanupReport`, `SessionMessage`, `RepoMemoryEvents`, `EventName`, `EventHandler`

**Tests**
- Added 33 new tests covering all v2.2.0 features (total: 158 tests)

### v2.1.0

**Bug Fixes**
- **Windows compatibility**: Fixed `EINVAL` errors caused by `:` in lookup index filenames. Scope filenames now use `encodeURIComponent` for cross-platform safety (`memories:agent1:user1` -> `memories%3Aagent1%3Auser1.json`). This was causing all storage operations to fail on Windows.

**Refactoring**
- **Consolidation pipelines**: Extracted `BaseConsolidationPipeline<T>` abstract class to eliminate code duplication across `ConsolidationPipeline`, `SkillConsolidationPipeline`, and `KnowledgeConsolidationPipeline`. Reduced ~267 lines to ~175 lines (35% less) with zero API changes. Shared logic (chunking, chunk processing, merge/delete) lives in the base class; subclasses only define collection-specific behavior.

### v2.0.0

- Complete rewrite from scratch
- Content-addressable storage with immutable commit chains
- 5 entity types with typed collections
- TF-IDF search with composite scoring
- AI pipelines for mining and consolidation
- CLI with all operations
- Zero runtime dependencies

## Development

```bash
npm run typecheck    # TypeScript strict check
npm test             # Run all tests (Vitest)
npm run build        # Build ESM + .d.ts + sourcemaps (tsup)
```

### Running Tests

Tests use temporary directories and clean up after themselves. ~414 tests across 36 files:

- **Unit tests**: tokenizer, TF-IDF, scoring, JSON serialization, CLI parser
- **Storage tests**: object store, commit store, ref store, engine, snapshots
- **Integration tests**: scoping, dedup, saveOrUpdate, batch operations
- **Simulation tests**: full agent workflow (onboarding, search, deletion, history)
- **v2.2 feature tests**: recall engine, events, structured sessions, cleanup, file locking, dedup threshold, AI validation, access tracking, NaN guards, ESM compatibility
- **v2.3 search tests**: Porter stemmer, query expansion, configurable scoring weights, access boost cap, score-based recall budget, index diagnostics
- **v2.4 gap tests**: saveOrUpdate for skills/knowledge, pagination, count, deleteMany, event emission on bulk ops
- **v2.5 feature tests**: MCP handler, auto-mining, portability (13), middleware (15), CLI commands (8), HTTP API (11)
- **v2.10 security tests**: path traversal prevention, restore locks, history depth limits, scope encoding, knowledge dedup source check, snapshot validation, HTTP size limits
- **v2.11 scalability tests**: scope encoding collision prevention (2), content size limits (4), conversation pagination (3), profile cross-agent limits (3), prefix scan bounds (2)
- **v2.12 hardening**: no new test files — all changes are internal robustness improvements validated by existing tests
- **v2.13 hardening tests**: broken commit chains, tag caps, path traversal, entity type validation, search limits, query stemming, snapshot validation, audit rotation, stray files, symlink protection, stemmer idempotence, index rebuild (23 tests)
- **v2.14 RAG tests**: chunker strategies (19), file/directory loader (14), ingest pipeline (8), query with/without AI (7), sync change detection (6), end-to-end pipeline (5) — 59 tests across 6 files
- **Benchmarks**: save/saveMany throughput, search latency

```bash
npm test                    # Run all tests
npx vitest run tests/search # Run only search tests
npx vitest --watch          # Watch mode
```

## License

MIT
