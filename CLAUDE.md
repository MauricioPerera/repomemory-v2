# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # Build ESM + .d.ts + sourcemaps (tsup, 3 entry points)
npm run typecheck    # TypeScript strict check (tsc --noEmit)
npm test             # Run all tests (vitest)
npx vitest run tests/search          # Run tests in a directory
npx vitest run tests/scoping.test.ts # Run a single test file
npx vitest --watch                   # Watch mode
```

## Architecture

RepoMemory is a Git-inspired persistent memory system for AI agents. Zero runtime dependencies — only `node:fs`, `node:path`, `node:crypto`, and `fetch`. ESM-only (`"type": "module"`).

### Three build entry points (tsup)

1. `src/index.ts` → `dist/index.js` — Core library
2. `src/ai/index.ts` → `dist/ai/index.js` — AI providers (sub-export `repomemory/ai`)
3. `src/cli.ts` → `dist/cli.js` — CLI binary

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
- **`BaseCollection`** (`src/collections/base.ts`) — Abstract base for all 5 entity types. Provides save/get/update/delete/list/search/pagination. Subclasses only implement `buildEntity()` and `searchScope()`.
- **`SearchEngine`** (`src/search/search-engine.ts`) — Manages scoped TF-IDF indices. Each `type:agentId:userId` combination has its own index, serialized to disk.
- **`RecallEngine`** (`src/recall/engine.ts`) — Score-based multi-collection query. Pools all results and takes top N by composite score.

### Scoping model

Entities are scoped by `type + agentId + userId`. Scope strings use colon separators (e.g., `memories:agent1:user1`). Skills and knowledge are agent-scoped only (no userId). The `_shared` agent ID (`SHARED_AGENT_ID`) enables cross-agent shared skills/knowledge.

Lookup index filenames use `encodeURIComponent` because `:` is invalid on Windows.

### Search pipeline

Query → synonym expansion (`query-expander.ts`) → tokenize + stopwords → Porter stem → TF-IDF rank → composite score (TF-IDF weight + Jaccard tag overlap + time decay + capped access boost).

### Key conventions

- All `.ts` imports use `.js` extensions (ESM resolution)
- Entity IDs are generated as `{type}-{base36timestamp}-{randomHex}`
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`
- Tests use temp directories and clean up after themselves
- Vitest globals are enabled (`describe`, `it`, `expect` without imports)
