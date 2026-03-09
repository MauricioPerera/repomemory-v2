/**
 * MCP protocol handler — pure logic, no I/O.
 * Testable independently from the stdio transport.
 */

import type { RepoMemory } from '../index.js';
import type { RecallOptions } from '../types/results.js';
import { RepoMemoryError } from '../types/errors.js';
import { scopeFromParts } from '../scoping.js';
import { SHARED_AGENT_ID } from '../types/entities.js';
import type { EntityType } from '../types/entities.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const tools: ToolDef[] = [
  // -- Memories --
  {
    name: 'memory_save',
    description: 'Save a new memory. Returns the saved entity and commit info.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent identifier' },
        userId: { type: 'string', description: 'User identifier' },
        content: { type: 'string', description: 'Memory content text' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
        category: { type: 'string', enum: ['fact', 'decision', 'issue', 'task'], description: 'Memory category (default: fact)' },
      },
      required: ['agentId', 'userId', 'content'],
    },
  },
  {
    name: 'memory_search',
    description: 'Search memories by text query. Returns scored results.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        userId: { type: 'string' },
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
      required: ['agentId', 'userId', 'query'],
    },
  },
  {
    name: 'memory_save_or_update',
    description: 'Save a memory or update an existing one if similar content is found (deduplication).',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        userId: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        category: { type: 'string', enum: ['fact', 'decision', 'issue', 'task'] },
      },
      required: ['agentId', 'userId', 'content'],
    },
  },
  {
    name: 'memory_list',
    description: 'List all memories for an agent/user.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        userId: { type: 'string' },
        limit: { type: 'number', description: 'Page size (default: 50)' },
        offset: { type: 'number', description: 'Page offset (default: 0)' },
      },
      required: ['agentId', 'userId'],
    },
  },
  // -- Skills --
  {
    name: 'skill_save',
    description: 'Save a new skill (agent-scoped, no userId).',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        category: { type: 'string', enum: ['procedure', 'configuration', 'troubleshooting', 'workflow'] },
        status: { type: 'string', enum: ['active', 'deprecated', 'draft'] },
      },
      required: ['agentId', 'content'],
    },
  },
  {
    name: 'skill_search',
    description: 'Search skills by query. Optionally include shared skills.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number' },
        includeShared: { type: 'boolean', description: 'Include _shared skills (default: false)' },
      },
      required: ['agentId', 'query'],
    },
  },
  {
    name: 'skill_save_or_update',
    description: 'Save a skill or update an existing one if similar content is found.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        category: { type: 'string', enum: ['procedure', 'configuration', 'troubleshooting', 'workflow'] },
        status: { type: 'string', enum: ['active', 'deprecated', 'draft'] },
      },
      required: ['agentId', 'content'],
    },
  },
  // -- Knowledge --
  {
    name: 'knowledge_save',
    description: 'Save a knowledge item (agent-scoped).',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string', description: 'Source file/URL' },
        version: { type: 'string' },
        questions: { type: 'array', items: { type: 'string' }, description: 'Questions this knowledge answers' },
      },
      required: ['agentId', 'content'],
    },
  },
  {
    name: 'knowledge_search',
    description: 'Search knowledge by query. Optionally include shared knowledge.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number' },
        includeShared: { type: 'boolean' },
      },
      required: ['agentId', 'query'],
    },
  },
  {
    name: 'knowledge_save_or_update',
    description: 'Save knowledge or update existing if similar content is found.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
        version: { type: 'string' },
        questions: { type: 'array', items: { type: 'string' } },
      },
      required: ['agentId', 'content'],
    },
  },
  // -- Sessions --
  {
    name: 'session_save',
    description: 'Save a session transcript. Supports plain text or structured messages.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        userId: { type: 'string' },
        content: { type: 'string', description: 'Session transcript text' },
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              content: { type: 'string' },
              timestamp: { type: 'string' },
            },
            required: ['role', 'content'],
          },
          description: 'Structured messages (preferred over plain content)',
        },
        conversationId: { type: 'string', description: 'Group related sessions' },
      },
      required: ['agentId', 'userId', 'content'],
    },
  },
  {
    name: 'session_list',
    description: 'List sessions for an agent/user.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        userId: { type: 'string' },
      },
      required: ['agentId', 'userId'],
    },
  },
  // -- Profiles --
  {
    name: 'profile_save',
    description: 'Save or overwrite a user profile for an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        userId: { type: 'string' },
        content: { type: 'string', description: 'Profile description' },
        metadata: { type: 'object', description: 'Arbitrary metadata' },
      },
      required: ['agentId', 'userId', 'content'],
    },
  },
  {
    name: 'profile_get',
    description: 'Get the current profile for a user under an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        userId: { type: 'string' },
      },
      required: ['agentId', 'userId'],
    },
  },
  // -- Cross-cutting --
  {
    name: 'recall',
    description: 'Retrieve relevant context across all collections (memories, skills, knowledge, profile). Returns a pre-formatted string ready for LLM system prompts.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        userId: { type: 'string' },
        query: { type: 'string', description: 'Context query' },
        maxItems: { type: 'number', description: 'Max total results (default: 20)' },
        maxChars: { type: 'number', description: 'Max total chars (default: 8000)' },
        includeSharedSkills: { type: 'boolean' },
        includeSharedKnowledge: { type: 'boolean' },
        includeProfile: { type: 'boolean' },
      },
      required: ['agentId', 'userId', 'query'],
    },
  },
  {
    name: 'entity_get',
    description: 'Get any entity by ID (memory, skill, knowledge, session, profile).',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        type: { type: 'string', enum: ['memory', 'skill', 'knowledge', 'session', 'profile'], description: 'Entity type' },
      },
      required: ['entityId', 'type'],
    },
  },
  {
    name: 'entity_delete',
    description: 'Delete an entity by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        type: { type: 'string', enum: ['memory', 'skill', 'knowledge', 'session', 'profile'] },
      },
      required: ['entityId', 'type'],
    },
  },
  {
    name: 'entity_history',
    description: 'Get the full commit history for an entity.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        type: { type: 'string', enum: ['memory', 'skill', 'knowledge', 'session', 'profile'] },
      },
      required: ['entityId', 'type'],
    },
  },
  {
    name: 'mine',
    description: 'Mine a session using AI to extract memories, skills, and profile updates. Requires AI provider configured on the server.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'ID of the session to mine' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'stats',
    description: 'Get storage statistics: entity counts, objects, commits, and index health.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'verify',
    description: 'Verify storage integrity: check all object hashes and commit references.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'export',
    description: 'Export all entities and access counts as a portable JSON object.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'import',
    description: 'Import entities from an export payload. Preserves original IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'object', description: 'Export data object (from the export tool)' },
        skipExisting: { type: 'boolean', description: 'Skip entities that already exist (default: false)' },
      },
      required: ['data'],
    },
  },
  // -- RAG --
  {
    name: 'rag_ingest',
    description: 'Ingest a file or directory into knowledge store as RAG chunks. Splits documents, deduplicates, and indexes for retrieval.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory path to ingest' },
        agentId: { type: 'string', description: 'Agent identifier' },
        chunkSize: { type: 'number', description: 'Target chunk size in characters (default: 1000)' },
        overlap: { type: 'number', description: 'Overlap between chunks in characters (default: 200)' },
        strategy: { type: 'string', enum: ['fixed', 'paragraph', 'markdown'], description: 'Chunking strategy (default: auto-detect)' },
      },
      required: ['path', 'agentId'],
    },
  },
  {
    name: 'rag_query',
    description: 'Query RAG knowledge chunks by text. Returns relevant chunks with formatted context. If AI is configured, generates an answer.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent identifier' },
        query: { type: 'string', description: 'Natural language query' },
        limit: { type: 'number', description: 'Max chunks to retrieve (default: 10)' },
        includeShared: { type: 'boolean', description: 'Include shared knowledge (default: false)' },
      },
      required: ['agentId', 'query'],
    },
  },
  {
    name: 'rag_sync',
    description: 'Sync a directory with the knowledge store. Detects new/modified/deleted files and updates chunks accordingly.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to sync' },
        agentId: { type: 'string', description: 'Agent identifier' },
        chunkSize: { type: 'number', description: 'Target chunk size in characters (default: 1000)' },
        overlap: { type: 'number', description: 'Overlap between chunks in characters (default: 200)' },
      },
      required: ['path', 'agentId'],
    },
  },
  {
    name: 'rag_status',
    description: 'Get RAG status for an agent: total chunks, unique sources, and storage stats.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent identifier' },
      },
      required: ['agentId'],
    },
  },
  // -- Neural --
  {
    name: 'neural_status',
    description: 'Get neural engine status: model info, loaded state, index stats, memory usage. Returns { enabled: false } if neural is not configured.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'neural_index',
    description: 'Batch-index all entities of a type for an agent into the neural embedding store. Use to build/rebuild the semantic index.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent identifier' },
        type: { type: 'string', enum: ['memory', 'skill', 'knowledge'], description: 'Entity type to index' },
        userId: { type: 'string', description: 'User identifier (required for memories)' },
      },
      required: ['agentId', 'type'],
    },
  },
  {
    name: 'neural_search',
    description: 'Semantic search via Matryoshka pyramid ranking. Bypasses TF-IDF — uses embedding similarity directly. Requires neural engine.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent identifier' },
        type: { type: 'string', enum: ['memory', 'skill', 'knowledge'], description: 'Entity type to search' },
        query: { type: 'string', description: 'Natural language query (supports cross-lingual)' },
        userId: { type: 'string', description: 'User identifier (required for memories)' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
        includeShared: { type: 'boolean', description: 'Include shared skills/knowledge (default: false)' },
      },
      required: ['agentId', 'type', 'query'],
    },
  },
  {
    name: 'neural_similarity',
    description: 'Compute semantic similarity between two texts. Returns a cosine similarity score (0 to 1). Requires neural engine.',
    inputSchema: {
      type: 'object',
      properties: {
        textA: { type: 'string', description: 'First text' },
        textB: { type: 'string', description: 'Second text' },
      },
      required: ['textA', 'textB'],
    },
  },
];

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

function requireString(args: Record<string, unknown>, key: string): string {
  const val = args[key];
  if (typeof val !== 'string' || val.length === 0) {
    throw new Error(`Missing or invalid required parameter: ${key} (expected non-empty string)`);
  }
  return val;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const val = args[key];
  if (val == null) return undefined;
  if (typeof val !== 'string') throw new Error(`Invalid parameter: ${key} (expected string)`);
  return val;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const val = args[key];
  if (val == null) return undefined;
  const n = typeof val === 'number' ? val : Number(val);
  if (Number.isNaN(n)) throw new Error(`Invalid parameter: ${key} (expected number)`);
  return n;
}

function optionalBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const val = args[key];
  if (val == null) return undefined;
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  throw new Error(`Invalid parameter: ${key} (expected boolean)`);
}

function optionalStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const val = args[key];
  if (val == null) return undefined;
  if (!Array.isArray(val)) throw new Error(`Invalid parameter: ${key} (expected array)`);
  return val.map((v, i) => {
    if (typeof v !== 'string') throw new Error(`Invalid parameter: ${key}[${i}] (expected string)`);
    return v;
  });
}

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------

function collectionFor(mem: RepoMemory, type: string) {
  switch (type) {
    case 'memory': return mem.memories;
    case 'skill': return mem.skills;
    case 'knowledge': return mem.knowledge;
    case 'session': return mem.sessions;
    case 'profile': return mem.profiles;
    default: throw new RepoMemoryError('INVALID_INPUT', `Unknown entity type: ${type}`);
  }
}

export async function handleTool(mem: RepoMemory, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    // Memories
    case 'memory_save': {
      const [entity, commit] = mem.memories.save(requireString(args, 'agentId'), requireString(args, 'userId'), {
        content: requireString(args, 'content'),
        tags: optionalStringArray(args, 'tags'),
        category: optionalString(args, 'category'),
      });
      return { entity, commit };
    }
    case 'memory_search': {
      return mem.memories.search(requireString(args, 'agentId'), requireString(args, 'userId'), requireString(args, 'query'), optionalNumber(args, 'limit') ?? 10);
    }
    case 'memory_save_or_update': {
      const [entity, commit, meta] = mem.memories.saveOrUpdate(requireString(args, 'agentId'), requireString(args, 'userId'), {
        content: requireString(args, 'content'),
        tags: optionalStringArray(args, 'tags'),
        category: optionalString(args, 'category'),
      });
      return { entity, commit, deduplicated: meta.deduplicated };
    }
    case 'memory_list': {
      return mem.memories.listPaginated(requireString(args, 'agentId'), requireString(args, 'userId'), {
        limit: optionalNumber(args, 'limit'),
        offset: optionalNumber(args, 'offset'),
      });
    }

    // Skills
    case 'skill_save': {
      const [entity, commit] = mem.skills.save(requireString(args, 'agentId'), undefined, {
        content: requireString(args, 'content'),
        tags: optionalStringArray(args, 'tags'),
        category: optionalString(args, 'category'),
        status: optionalString(args, 'status'),
      });
      return { entity, commit };
    }
    case 'skill_search': {
      return mem.skills.search(requireString(args, 'agentId'), requireString(args, 'query'), optionalNumber(args, 'limit') ?? 10, optionalBoolean(args, 'includeShared') ?? false);
    }
    case 'skill_save_or_update': {
      const [entity, commit, meta] = mem.skills.saveOrUpdate(requireString(args, 'agentId'), {
        content: requireString(args, 'content'),
        tags: optionalStringArray(args, 'tags'),
        category: optionalString(args, 'category'),
        status: optionalString(args, 'status'),
      });
      return { entity, commit, deduplicated: meta.deduplicated };
    }

    // Knowledge
    case 'knowledge_save': {
      const [entity, commit] = mem.knowledge.save(requireString(args, 'agentId'), undefined, {
        content: requireString(args, 'content'),
        tags: optionalStringArray(args, 'tags'),
        source: optionalString(args, 'source'),
        version: optionalString(args, 'version'),
        questions: optionalStringArray(args, 'questions'),
      });
      return { entity, commit };
    }
    case 'knowledge_search': {
      return mem.knowledge.search(requireString(args, 'agentId'), requireString(args, 'query'), optionalNumber(args, 'limit') ?? 10, optionalBoolean(args, 'includeShared') ?? false);
    }
    case 'knowledge_save_or_update': {
      const [entity, commit, meta] = mem.knowledge.saveOrUpdate(requireString(args, 'agentId'), {
        content: requireString(args, 'content'),
        tags: optionalStringArray(args, 'tags'),
        source: optionalString(args, 'source'),
        version: optionalString(args, 'version'),
        questions: optionalStringArray(args, 'questions'),
      });
      return { entity, commit, deduplicated: meta.deduplicated };
    }

    // Sessions
    case 'session_save': {
      // Validate messages[] structure if provided
      if (args.messages != null) {
        if (!Array.isArray(args.messages)) {
          throw new Error('Invalid parameter: messages (expected array)');
        }
        for (let i = 0; i < (args.messages as unknown[]).length; i++) {
          const msg = (args.messages as Record<string, unknown>[])[i];
          if (!msg || typeof msg !== 'object') {
            throw new Error(`Invalid parameter: messages[${i}] (expected object with role and content)`);
          }
          if (typeof msg.role !== 'string' || (msg.role as string).length === 0) {
            throw new Error(`Invalid parameter: messages[${i}].role (expected non-empty string)`);
          }
          if (typeof msg.content !== 'string') {
            throw new Error(`Invalid parameter: messages[${i}].content (expected string)`);
          }
        }
      }
      const [entity, commit] = mem.sessions.save(requireString(args, 'agentId'), requireString(args, 'userId'), {
        content: requireString(args, 'content'),
        messages: args.messages,
        conversationId: optionalString(args, 'conversationId'),
      });
      return { entity, commit };
    }
    case 'session_list': {
      return mem.sessions.list(requireString(args, 'agentId'), requireString(args, 'userId'));
    }

    // Profiles
    case 'profile_save': {
      const [entity, commit] = mem.profiles.save(requireString(args, 'agentId'), requireString(args, 'userId'), {
        content: requireString(args, 'content'),
        metadata: args.metadata,
      });
      return { entity, commit };
    }
    case 'profile_get': {
      return mem.profiles.getByUser(requireString(args, 'agentId'), requireString(args, 'userId'));
    }

    // Cross-cutting
    case 'recall': {
      const opts: RecallOptions = {};
      const maxItems = optionalNumber(args, 'maxItems');
      const maxChars = optionalNumber(args, 'maxChars');
      if (maxItems != null) opts.maxItems = maxItems;
      if (maxChars != null) opts.maxChars = maxChars;
      const inclSkills = optionalBoolean(args, 'includeSharedSkills');
      const inclKnowledge = optionalBoolean(args, 'includeSharedKnowledge');
      const inclProfile = optionalBoolean(args, 'includeProfile');
      if (inclSkills != null) opts.includeSharedSkills = inclSkills;
      if (inclKnowledge != null) opts.includeSharedKnowledge = inclKnowledge;
      if (inclProfile != null) opts.includeProfile = inclProfile;
      const ctx = mem.recall(requireString(args, 'agentId'), requireString(args, 'userId'), requireString(args, 'query'), opts);
      return {
        formatted: ctx.formatted,
        totalItems: ctx.totalItems,
        estimatedChars: ctx.estimatedChars,
        profile: ctx.profile,
      };
    }
    case 'entity_get': {
      const col = collectionFor(mem, requireString(args, 'type'));
      return col.get(requireString(args, 'entityId'));
    }
    case 'entity_delete': {
      const col = collectionFor(mem, requireString(args, 'type'));
      return col.delete(requireString(args, 'entityId'));
    }
    case 'entity_history': {
      const col = collectionFor(mem, requireString(args, 'type'));
      return col.history(requireString(args, 'entityId'));
    }
    case 'mine': {
      return await mem.mine(requireString(args, 'sessionId'));
    }
    case 'stats': {
      return mem.stats();
    }
    case 'verify': {
      return mem.verify();
    }
    case 'export': {
      return mem.export();
    }
    case 'import': {
      if (!args.data || typeof args.data !== 'object') {
        throw new Error('Missing or invalid required parameter: data (expected object)');
      }
      return mem.import(args.data as Parameters<typeof mem.import>[0], {
        skipExisting: optionalBoolean(args, 'skipExisting'),
      });
    }

    // RAG
    case 'rag_ingest': {
      const { ingestPath } = await import('../rag/ingest.js');
      return ingestPath(mem, requireString(args, 'path'), {
        agent: requireString(args, 'agentId'),
        chunkSize: optionalNumber(args, 'chunkSize'),
        overlap: optionalNumber(args, 'overlap'),
        strategy: optionalString(args, 'strategy') as 'fixed' | 'paragraph' | 'markdown' | undefined,
      });
    }
    case 'rag_query': {
      return await mem.ragQuery(requireString(args, 'agentId'), requireString(args, 'query'), {
        limit: optionalNumber(args, 'limit'),
        includeShared: optionalBoolean(args, 'includeShared'),
      });
    }
    case 'rag_sync': {
      const { syncDirectory } = await import('../rag/sync.js');
      return syncDirectory(mem, requireString(args, 'path'), {
        agent: requireString(args, 'agentId'),
        chunkSize: optionalNumber(args, 'chunkSize'),
        overlap: optionalNumber(args, 'overlap'),
      });
    }
    case 'rag_status': {
      const agentId = requireString(args, 'agentId');
      const all = mem.knowledge.list(agentId);
      const ragChunks = all.filter(k => k.source != null && k.chunkIndex != null);
      const sources = new Set(ragChunks.map(k => k.source));
      return {
        totalChunks: ragChunks.length,
        uniqueSources: sources.size,
        sources: [...sources],
        totalKnowledge: all.length,
      };
    }

    // Neural
    case 'neural_status': {
      const neural = mem.neural;
      if (!neural) return { enabled: false };
      return { enabled: true, ready: neural.isReady, ...neural.stats() };
    }
    case 'neural_index': {
      const neural = mem.neural;
      if (!neural?.isReady) {
        throw new RepoMemoryError('NEURAL_NOT_READY', 'Neural engine not ready. Ensure neural is enabled and model is loaded.');
      }
      const agentId = requireString(args, 'agentId');
      const type = requireString(args, 'type') as EntityType;
      const userId = optionalString(args, 'userId');
      if (type === 'memory' && !userId) {
        throw new Error('userId is required when indexing memories');
      }
      const col = collectionFor(mem, type);
      const entities = col.list(agentId, userId);
      const scope = scopeFromParts(type, agentId, userId);
      const items = entities
        .filter(e => 'content' in e && typeof (e as { content: string }).content === 'string')
        .map(e => ({ entityId: e.id, content: (e as { content: string }).content }));
      const indexed = await neural.indexBatch(scope, items);
      neural.flush();
      return { indexed, scope, type, agentId };
    }
    case 'neural_search': {
      const neural = mem.neural;
      if (!neural?.isReady) {
        throw new RepoMemoryError('NEURAL_NOT_READY', 'Neural engine not ready. Ensure neural is enabled and model is loaded.');
      }
      const agentId = requireString(args, 'agentId');
      const type = requireString(args, 'type') as EntityType;
      const query = requireString(args, 'query');
      const userId = optionalString(args, 'userId');
      const limit = optionalNumber(args, 'limit') ?? 10;
      const includeShared = optionalBoolean(args, 'includeShared') ?? false;
      if (type === 'memory' && !userId) {
        throw new Error('userId is required when searching memories');
      }
      const scope = scopeFromParts(type, agentId, userId);
      const scopes = [scope];
      if (includeShared && (type === 'skill' || type === 'knowledge')) {
        scopes.push(scopeFromParts(type, SHARED_AGENT_ID));
      }
      const results = scopes.length === 1
        ? await neural.rank(scope, query, limit)
        : await neural.rankMultiScope(scopes, query, limit);
      // Hydrate with entities
      const col = collectionFor(mem, type);
      const hydrated = results
        .map(r => {
          const entity = col.get(r.entityId);
          return entity ? { entity, score: r.score } : null;
        })
        .filter(Boolean);
      return hydrated;
    }
    case 'neural_similarity': {
      const neural = mem.neural;
      if (!neural?.isReady) {
        throw new RepoMemoryError('NEURAL_NOT_READY', 'Neural engine not ready. Ensure neural is enabled and model is loaded.');
      }
      const textA = requireString(args, 'textA');
      const textB = requireString(args, 'textB');
      const score = await neural.similarity(textA, textB);
      return { textA, textB, similarity: score };
    }

    default:
      throw new RepoMemoryError('INVALID_INPUT', `Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC request handler
// ---------------------------------------------------------------------------

const SERVER_INFO = {
  name: 'repomemory',
  version: '2.15.0',
};

const CAPABILITIES = {
  tools: {},
};

/** Timeout for tool execution (5 minutes — covers long AI operations like mining) */
const TOOL_TIMEOUT_MS = 5 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

function makeResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function makeError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export async function handleRequest(mem: RepoMemory, req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;

  switch (req.method) {
    case 'initialize':
      return makeResult(id, {
        protocolVersion: '2024-11-05',
        serverInfo: SERVER_INFO,
        capabilities: CAPABILITIES,
      });

    case 'notifications/initialized':
      return null;

    case 'tools/list':
      return makeResult(id, { tools });

    case 'tools/call': {
      const params = req.params ?? {};
      const toolName = params.name as string;
      const toolArgs = (params.arguments as Record<string, unknown>) ?? {};

      if (!toolName) {
        return makeError(id, -32602, 'Missing tool name');
      }

      try {
        const result = await withTimeout(
          handleTool(mem, toolName, toolArgs),
          TOOL_TIMEOUT_MS,
          `Tool '${toolName}'`,
        );
        return makeResult(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return makeResult(id, {
          content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
          isError: true,
        });
      }
    }

    case 'ping':
      return makeResult(id, {});

    default:
      return makeError(id, -32601, `Method not found: ${req.method}`);
  }
}
