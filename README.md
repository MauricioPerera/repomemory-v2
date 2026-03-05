# RepoMemory v2

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
- **Event system** — typed event bus for entity lifecycle hooks (`entity:save`, `entity:update`, `entity:delete`, `session:mined`, `consolidation:done`). Handler errors are caught internally and never crash core operations
- **TTL cleanup** — remove stale entities by age, with dry-run support and audit log rotation
- **File locking** — filesystem-based mutex wraps every `save()` and `delete()` for concurrent access safety (configurable via `lockEnabled`)
- **AI validation** — strict schema validators on AI responses (non-empty content, typed tags, valid IDs) with automatic retry on malformed output
- **Optional AI** — mining and consolidation (memories, skills, knowledge) via OpenAI, Anthropic, or Ollama
- **Zero runtime dependencies** — only Node.js built-ins (`node:fs`, `node:path`, `node:crypto`, `fetch`)
- **Library + CLI** — import as a TypeScript library or use from the command line
- **Cross-platform** — works on Windows, macOS, and Linux

## Install

```bash
npm install repomemory
```

## Quick Start

### As a library

```ts
import { RepoMemory } from 'repomemory';

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

## API Reference

### `RepoMemory`

```ts
import { RepoMemory } from 'repomemory';

const mem = new RepoMemory({
  dir: '.repomemory',
  ai: provider,              // optional — OllamaProvider, OpenAiProvider, AnthropicProvider
  dedupThreshold: 0.2,       // optional — similarity threshold for saveOrUpdate (default: 0.2)
  maxSessionChars: 100_000,  // optional — max chars sent to AI mining (default: 100K)
  lockEnabled: true,         // optional — filesystem locking for concurrent access (default: true)
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

// List all conversations (grouped summary)
mem.sessions.listConversations('agent-1', 'user-1');
// [{ conversationId: 'conv-abc', count: 3, latest: '2024-01-03T...' }, ...]
```

##### `mem.profiles`

```ts
mem.profiles.save('agent-1', 'user-1', {
  content: 'Senior developer, prefers concise responses',
  metadata: { language: 'en', timezone: 'UTC-3' },  // optional
});

mem.profiles.getByUser('agent-1', 'user-1');

// Get all profiles for a user across every agent (sorted by updatedAt)
mem.profiles.getByUserAcrossAgents('user-1');

// Save/get a shared profile (agentId = _shared)
mem.profiles.saveShared('user-1', { content: 'Global user preferences' });
mem.profiles.getSharedByUser('user-1');
```

#### Flush

Call `flush()` to persist search indices and access counts to disk. This is called automatically on individual `save()`/`update()`/`delete()`, but if you use batch operations or search (which tracks access counts), call it explicitly:

```ts
mem.memories.search('agent-1', 'user-1', 'query');  // increments access counts in memory
mem.flush();  // writes search indices + access counts to disk
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
import { RepoMemory } from 'repomemory';
import { OllamaProvider } from 'repomemory/ai';

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

##### Available Providers

```ts
import { OllamaProvider, OpenAiProvider, AnthropicProvider } from 'repomemory/ai';

new OllamaProvider({ model: 'llama3.1', baseUrl: 'http://localhost:11434' });
new OpenAiProvider({ apiKey: '...', model: 'gpt-4o-mini' });       // or OPENAI_API_KEY env
new AnthropicProvider({ apiKey: '...', model: 'claude-sonnet-4-20250514' }); // or ANTHROPIC_API_KEY env
```

##### Custom Provider

```ts
import type { AiProvider, AiMessage } from 'repomemory';

class MyProvider implements AiProvider {
  async chat(messages: AiMessage[]): Promise<string> {
    // Call your LLM here
    return '...';
  }
}
```

## CLI Reference

```
repomemory init [--dir <path>]
repomemory save <type> --agent <id> [--user <id>] --content <text> [--tags t1,t2] [--category ...]
repomemory save session --agent <id> --user <id> --file <path>
repomemory search <query> --agent <id> [--user <id>] [--type memories|skills|knowledge] [--limit 5]
repomemory get <entityId>
repomemory list <type> --agent <id> [--user <id>]
repomemory history <entityId>
repomemory snapshot create [label]
repomemory snapshot list
repomemory snapshot restore <id>
repomemory mine <sessionId> [--provider ollama|openai|anthropic] [--model <name>]
repomemory consolidate --agent <id> [--user <id>] [--type memories|skills|knowledge] [--provider ollama] [--model <name>]
repomemory recall <query> --agent <id> --user <id> [--max-items 20] [--max-chars 8000]
repomemory cleanup [--max-age 90] [--max-audit 10000] [--dry-run]
repomemory stats
repomemory verify
```

All commands accept `--dir <path>` to specify the storage directory (default: `.repomemory`).

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
|   +-- RepoMemoryEventBus  Typed EventEmitter wrapper with try-catch protection (entity:save/update/delete, session:mined, consolidation:done)
|
+-- Cleanup
|   +-- runCleanup          TTL-based entity removal with dry-run and audit rotation
|
+-- AI Pipelines (optional, lazy-loaded)
|   +-- MiningPipeline              Extract memories + skills + profile from session (structured messages aware)
|   +-- ConsolidationPipeline       Merge/dedup memories by category (chunks of 20)
|   +-- SkillConsolidationPipeline  Merge/dedup skills by category
|   +-- KnowledgeConsolidationPipeline  Merge/dedup knowledge items
|   +-- AiService                   Schema-validated JSON parsing with retry
|
+-- AI Providers (sub-export: repomemory/ai)
    +-- OllamaProvider     Local Ollama (default: llama3.1)
    +-- OpenAiProvider     OpenAI API (default: gpt-4o-mini)
    +-- AnthropicProvider  Anthropic Messages API (default: claude-sonnet-4-20250514)
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
score = relevance * decay * accessBoost

relevance   = tfidfScore * tfidfWeight + tagOverlap * tagWeight
tagOverlap  = |intersection| / |union|    (Jaccard similarity)
decay       = e^(-decayRate * daysSinceUpdate)    (0 if decayRate = 0)
accessBoost = min(1 + log2(1 + accessCount), maxAccessBoost)
```

Default weights: `tfidfWeight=0.7`, `tagWeight=0.3`, `decayRate=0.005`, `maxAccessBoost=5.0`. All configurable via `scoring` config option.

The TF-IDF index is cached to disk and updated incrementally — no full rebuild on each search.

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

## Changelog

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

Tests use temporary directories and clean up after themselves. 208 tests across 18 files:

- **Unit tests**: tokenizer, TF-IDF, scoring, JSON serialization, CLI parser
- **Storage tests**: object store, commit store, ref store, engine, snapshots
- **Integration tests**: scoping, dedup, saveOrUpdate, batch operations
- **Simulation tests**: full agent workflow (onboarding, search, deletion, history)
- **v2.2 feature tests**: recall engine, events, structured sessions, cleanup, file locking, dedup threshold, AI validation, access tracking, NaN guards, ESM compatibility
- **v2.3 search tests**: Porter stemmer, query expansion, configurable scoring weights, access boost cap, score-based recall budget, index diagnostics
- **v2.4 gap tests**: saveOrUpdate for skills/knowledge, pagination, count, deleteMany, event emission on bulk ops
- **Benchmarks**: save/saveMany throughput, search latency

```bash
npm test                    # Run all tests
npx vitest run tests/search # Run only search tests
npx vitest --watch          # Watch mode
```

## License

MIT
