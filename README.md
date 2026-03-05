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
- **Incremental TF-IDF search** — cached to disk, updated incrementally on writes, Jaccard tag overlap
- **Deduplication** — `saveOrUpdate()` detects similar content and updates instead of duplicating
- **Batch operations** — `saveMany()` and `incrementMany()` for bulk writes with single flush
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

const mem = new RepoMemory({ dir: '.repomemory' });
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
| `list` | `(agentId, userId?)` | `Entity[]` |
| `history` | `(entityId)` | `CommitInfo[]` |

`mem.memories` also has `saveOrUpdate(agentId, userId, input)` which deduplicates automatically, and `search()` which tracks access counts.

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
```

##### `mem.sessions`

```ts
mem.sessions.save('agent-1', 'user-1', {
  content: 'Full session transcript...',
  startedAt: '2024-01-01T00:00:00Z',  // optional
  endedAt: '2024-01-01T01:00:00Z',    // optional
  conversationId: 'conv-abc',          // optional — groups related sessions
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
// { memories: 15, skills: 3, knowledge: 8, sessions: 5, profiles: 2, objects: 42, commits: 38 }
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

1. Entity data -> `objectHash = sha256(serialized)` -> written to `objects/`
2. Existing ref read to get `parentHash`
3. Commit created: `{ parent, objectHash, timestamp, author, message }` -> written to `commits/`
4. Ref updated to point to new commit
5. Lookup index and TF-IDF index updated incrementally
6. Operation appended to audit log

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
|   +-- AuditLog           Append-only operation log (JSONL)
|   +-- SnapshotManager    Full point-in-time backups
|
+-- Search Layer
|   +-- SearchEngine       Scoped TF-IDF indices, persisted to disk
|   +-- TfIdfIndex         Term frequency-inverse document frequency with serialization
|   +-- Tokenizer          Word tokenization with stopwords (EN + ES)
|   +-- Scoring            Composite: TF-IDF + Jaccard tags + decay + access boost
|
+-- Collections (typed CRUD facades)
|   +-- MemoryCollection   facts, decisions, issues, tasks (+ saveOrUpdate dedup)
|   +-- SkillCollection    procedures, config, troubleshooting, workflows
|   +-- KnowledgeCollection  source, chunks, versions, questions
|   +-- SessionCollection  conversations, mined flag, conversationId grouping
|   +-- ProfileCollection  per agent/user profiles with metadata
|
+-- AI Pipelines (optional, lazy-loaded)
|   +-- MiningPipeline              Extract memories + skills + profile from session
|   +-- ConsolidationPipeline       Merge/dedup memories by category (chunks of 20)
|   +-- SkillConsolidationPipeline  Merge/dedup skills by category
|   +-- KnowledgeConsolidationPipeline  Merge/dedup knowledge items
|
+-- AI Providers (sub-export: repomemory/ai)
    +-- OllamaProvider     Local Ollama (default: llama3.1)
    +-- OpenAiProvider     OpenAI API (default: gpt-4o-mini)
    +-- AnthropicProvider  Anthropic Messages API (default: claude-sonnet-4-20250514)
```

### Search Scoring

Scoring combines relevance, time decay, and access frequency:

```
score = relevance * decay * accessBoost

relevance   = tfidfScore * 0.7 + tagOverlap * 0.3
tagOverlap  = |intersection| / |union|    (Jaccard similarity)
decay       = e^(-0.005 * daysSinceUpdate)
accessBoost = 1 + log2(1 + accessCount)
```

The TF-IDF index is cached to disk and updated incrementally — no full rebuild on each search.

**Note:** The combined score is not normalized to [0, 1]. TF-IDF values depend on corpus size and term distribution, and `accessBoost` amplifies the score further. Keep this in mind when setting absolute thresholds (e.g., dedup uses 0.2).

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

## Changelog

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

Tests use temporary directories and clean up after themselves. The full suite includes:

- **Unit tests**: tokenizer, TF-IDF, scoring, JSON serialization, CLI parser
- **Storage tests**: object store, commit store, ref store, engine, snapshots
- **Integration tests**: scoping, dedup, saveOrUpdate, batch operations
- **Simulation tests**: full agent workflow (onboarding, search, deletion, history)
- **Benchmarks**: save/saveMany throughput, search latency

```bash
npm test                    # Run all tests
npx vitest run tests/search # Run only search tests
npx vitest --watch          # Watch mode
```

## License

MIT
