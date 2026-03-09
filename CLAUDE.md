# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # Build ESM + .d.ts + sourcemaps (tsup, 5 entry points)
npm run typecheck    # TypeScript strict check (tsc --noEmit)
npm test             # Run all tests (vitest)
npx vitest run tests/search          # Run tests in a directory
npx vitest run tests/scoping.test.ts # Run a single test file
npx vitest --watch                   # Watch mode
```

## Architecture

RepoMemory is a Git-inspired persistent memory system for AI agents. Zero runtime dependencies — only `node:fs`, `node:path`, `node:crypto`, and `fetch`. ESM-only (`"type": "module"`).

### Six build entry points (tsup)

1. `src/index.ts` → `dist/index.js` — Core library
2. `src/ai/index.ts` → `dist/ai/index.js` — AI providers (sub-export `repomemory/ai`)
3. `src/rag/index.ts` → `dist/rag/index.js` — RAG pipeline (sub-export `repomemory/rag`)
4. `src/cli.ts` → `dist/cli.js` — CLI binary (`repomemory`)
5. `src/mcp.ts` → `dist/mcp.js` — MCP server binary (`repomemory-mcp`)
6. `src/http.ts` → `dist/http.js` — HTTP API binary (`repomemory-http`)

### Core data flow: Git-like storage

Every `save()` follows this path:
1. Entity data → SHA-256 hash → written to `objects/` (content-addressable)
2. Commit created with `{ parent, objectHash, timestamp, author, message }` → written to `commits/`
3. Ref updated to point to new commit hash (`refs/`)
4. Lookup index updated (`entityId → refPath`)
5. TF-IDF search index updated incrementally
6. Operation appended to audit log

Deletes create a **tombstone commit** (`objectHash: "TOMBSTONE"`). The ref still points to it, preserving full history.

### Layer structure

- **`RepoMemory`** (`src/index.ts`) — Facade. Wires everything together. AI pipelines are `await import()`-ed lazily.
- **`StorageEngine`** (`src/storage/engine.ts`) — Orchestrates ObjectStore, CommitStore, RefStore, LookupIndex, AuditLog, LockGuard. All writes go through `lock.withLock()`.
- **`BaseCollection`** (`src/collections/base.ts`) — Abstract base for all 5 entity types. Provides save/get/update/delete/list/search/pagination. Runs middleware chain on save/update/delete.
- **`SearchEngine`** (`src/search/search-engine.ts`) — Manages scoped TF-IDF indices. Each `type:agentId:userId` combination has its own index, serialized to disk.
- **`RecallEngine`** (`src/recall/engine.ts`) — Score-based multi-collection query. Pools all results and takes top N by composite score.
- **`MiddlewareChain`** (`src/middleware.ts`) — Ordered beforeSave/beforeUpdate/beforeDelete hooks. Short-circuits on null/false.
- **`MCP handler`** (`src/mcp/handler.ts`) — 27 tools, JSON-RPC dispatch. Shared by both MCP and HTTP servers.
- **`RAG Pipeline`** (`src/rag/`) — Document ingestion (chunker, loader, ingest), query with optional AI answers, incremental sync via SHA-256 hashing. Lazy-loaded from facade.
- **`Portability`** (`src/portability.ts`) — Export/import of all entities + access counts as portable JSON.

### Scoping model

Entities are scoped by `type + agentId + userId`. Scope strings use colon separators (e.g., `memories:agent1:user1`). Skills and knowledge are agent-scoped only (no userId). The `_shared` agent ID (`SHARED_AGENT_ID`) enables cross-agent shared skills/knowledge.

Lookup index filenames use `encodeURIComponent` because `:` is invalid on Windows.

**Scope encoding (v2.11.0)**: TF-IDF cache filenames encode each scope segment with `encodeURIComponent` AND additionally replace `_` → `%5F`. This prevents collisions when underscores appear in different segment positions (e.g., `agent_1:user` vs `agent:1_user`). Legacy fallbacks support v2.10.x and pre-v2.10 formats for seamless migration.

### Search pipeline

Query → synonym expansion (`query-expander.ts`) → tokenize + stopwords → Porter stem → TF-IDF rank → composite score (TF-IDF weight + Jaccard tag overlap + time decay + capped access boost).

### Performance model

- **Deferred flush**: Individual `save()`/`update()`/`delete()` do NOT flush search indices to disk. Flush happens before `find()`/`findMultiScope()` and at batch boundaries. If adding a new write path, do NOT add per-operation flush — add flush before the read path instead.
- **Eager LookupIndex**: All scopes are loaded on `init()` into `globalIndex`. `findById()` is always O(1). No fallback scan.
- **Scoping utility** (`src/scoping.ts`): Single source of truth for scope strings and ref paths. Use `scopeFromEntity()`, `scopeFromParts()`, `refBaseFromEntity()` — do not duplicate the switch logic.
- **AI request timeouts**: All AI providers use `AbortController` with configurable `timeoutMs` (default 120s). If adding a new provider, always include timeout + abort handling.
- **Lock backoff**: `LockGuard` uses `Atomics.wait()` for zero-CPU sleep with exponential backoff (10ms base, 500ms cap, jitter). Do NOT revert to busy-wait.
- **Tag scoring normalization**: `computeTagOverlap()` normalizes to lowercase. Do NOT compare raw entity tags against query tags without normalization.
- **Skills dedup in mining**: Mining uses `saveOrUpdate()` for both memories and skills. Do NOT use plain `save()` for skills in the mining pipeline — it creates duplicates.
- **CLI `--base-url`**: The `mine` and `consolidate` commands accept `--base-url` for custom AI endpoints. `OpenAiProvider` also reads `OPENAI_BASE_URL` env var.
- **Content size limit**: `StorageEngine.validateEntity()` checks `Buffer.byteLength(content, 'utf8')` against `MAX_CONTENT_SIZE` (1 MB). Prevents DoS via oversized entities. Applied to all entity types on save.
- **Bounded scans**: `listConversations()` uses `MAX_SCAN = 5000` to cap session scanning (returns `truncated: true` when exceeded). `listEntitiesByPrefix()` accepts `maxResults` (default 10,000). `getByUserAcrossAgents()` accepts `limit` (default 50) with early break. Do NOT remove these caps — they prevent OOM on large datasets.
- **Knowledge dedup source check**: `saveOrUpdate()` on knowledge filters candidates by matching `source` field. Two knowledge entries with different sources will not be considered duplicates even if content is similar.
- **Search limit cap (v2.12.0)**: `find()` and `findMultiScope()` clamp the `limit` parameter to `MAX_SEARCH_LIMIT` (200). Do NOT remove this cap — it prevents DoS via excessive limit values.
- **Entity validation (v2.12.0)**: `StorageEngine.validateEntity()` validates entity type against a whitelist (`VALID_ENTITY_TYPES`) and caps tags arrays to `MAX_TAGS` (50). Prevents invalid types and excessive tag counts.
- **Tombstone design**: Deletes do NOT remove the entity from the lookup index. The lookup entry is preserved so that `history()` can still traverse the commit chain for deleted entities. All read paths (`load`, `list`, `count`) already check for `TOMBSTONE` and skip deleted entries. `rebuildLookupIndex()` cleans up stale lookup entries on demand.
- **Pagination optimization (v2.12.0)**: `listEntitiesPaginated()` uses a two-pass approach — first counts alive entries by checking commit hashes (without loading objects), then loads only the requested page slice. Do NOT revert to single-pass which loads all objects into memory.
- **Snapshot atomicity (v2.12.0)**: `SnapshotManager.create()` acquires a `LockGuard` during snapshot creation to prevent concurrent writes from corrupting the snapshot. The lock is passed via constructor.
- **Consolidation idempotency (v2.12.0)**: All consolidation pipelines (`ConsolidationPipeline`, `SkillConsolidationPipeline`, `KnowledgeConsolidationPipeline`) use `saveOrUpdate()` instead of plain `save()` to prevent duplicates on repeated consolidation runs.
- **Import dedup (v2.12.0)**: `importData()` pre-validates all entities and detects duplicate entity IDs within the import data before saving. Prevents silently overwriting earlier entities in the same import batch.
- **Session message validation (v2.12.0)**: The MCP `session_save` tool validates `messages[]` structure — each element must have `role` (non-empty string) and `content` (string) fields.
- **HTTP graceful shutdown (v2.12.0)**: The HTTP server handles `SIGTERM` and `SIGINT` signals — flushes pending data, closes connections, and exits cleanly. 5-second forced shutdown timeout.

### Key conventions

- All `.ts` imports use `.js` extensions (ESM resolution)
- Entity IDs are generated as `{type}-{base36timestamp}-{randomHex}`
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`
- Tests use temp directories and clean up after themselves
- Vitest globals are enabled (`describe`, `it`, `expect` without imports)
- No vectors/embeddings by design — TF-IDF + AI mining replaces vector search
- The project is private and model-agnostic — any LLM that can read/write should be able to interact with it
