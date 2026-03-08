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

### Five build entry points (tsup)

1. `src/index.ts` → `dist/index.js` — Core library
2. `src/ai/index.ts` → `dist/ai/index.js` — AI providers (sub-export `repomemory/ai`)
3. `src/cli.ts` → `dist/cli.js` — CLI binary (`repomemory`)
4. `src/mcp.ts` → `dist/mcp.js` — MCP server binary (`repomemory-mcp`)
5. `src/http.ts` → `dist/http.js` — HTTP API binary (`repomemory-http`)

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
- **`MCP handler`** (`src/mcp/handler.ts`) — 23 tools, JSON-RPC dispatch. Shared by both MCP and HTTP servers.
- **`Portability`** (`src/portability.ts`) — Export/import of all entities + access counts as portable JSON.

### Scoping model

Entities are scoped by `type + agentId + userId`. Scope strings use colon separators (e.g., `memories:agent1:user1`). Skills and knowledge are agent-scoped only (no userId). The `_shared` agent ID (`SHARED_AGENT_ID`) enables cross-agent shared skills/knowledge.

Lookup index filenames use `encodeURIComponent` because `:` is invalid on Windows.

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

### Key conventions

- All `.ts` imports use `.js` extensions (ESM resolution)
- Entity IDs are generated as `{type}-{base36timestamp}-{randomHex}`
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`
- Tests use temp directories and clean up after themselves
- Vitest globals are enabled (`describe`, `it`, `expect` without imports)
- No vectors/embeddings by design — TF-IDF + AI mining replaces vector search
- The project is private and model-agnostic — any LLM that can read/write should be able to interact with it
