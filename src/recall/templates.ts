/**
 * Prompt template system for configurable context injection.
 * Templates control how recall context is formatted for LLM system prompts.
 */

export interface PromptTemplate {
  /** Unique template identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Section priority order. Sections are rendered in this order, respecting the maxChars budget. */
  sectionOrder: Array<'profile' | 'memories' | 'skills' | 'knowledge'>;
  /** Per-section header overrides */
  sectionHeaders?: {
    profile?: string;
    memories?: string;
    skills?: string;
    knowledge?: string;
  };
  /** Per-collection weight multipliers. Applied to scores before pooling in RecallEngine.
   *  Higher weight = more items from that collection in the final context. */
  collectionWeights?: {
    memories?: number;
    skills?: number;
    knowledge?: number;
  };
  /** Optional system preamble prepended before all sections */
  preamble?: string;
}

/** Default section headers used when not overridden by template */
export const DEFAULT_HEADERS = {
  profile: '## User Profile',
  memories: '## Relevant Memories',
  skills: '## Relevant Skills',
  knowledge: '## Relevant Knowledge',
} as const;

/** Built-in templates */
export const BUILTIN_TEMPLATES: Record<string, PromptTemplate> = {
  default: {
    id: 'default',
    name: 'Default',
    sectionOrder: ['profile', 'memories', 'skills', 'knowledge'],
  },

  technical: {
    id: 'technical',
    name: 'Technical',
    sectionOrder: ['profile', 'skills', 'knowledge', 'memories'],
    sectionHeaders: {
      skills: '## Procedures & Patterns',
      knowledge: '## Technical Reference',
      memories: '## Context Notes',
    },
    collectionWeights: {
      memories: 0.7,
      skills: 1.5,
      knowledge: 1.3,
    },
  },

  support: {
    id: 'support',
    name: 'Customer Support',
    sectionOrder: ['profile', 'memories', 'knowledge', 'skills'],
    sectionHeaders: {
      memories: '## Customer History',
      knowledge: '## Knowledge Base',
      skills: '## Response Procedures',
    },
    collectionWeights: {
      memories: 1.5,
      skills: 0.8,
      knowledge: 1.2,
    },
  },

  rag_focused: {
    id: 'rag_focused',
    name: 'RAG-Focused',
    sectionOrder: ['knowledge', 'profile', 'memories', 'skills'],
    sectionHeaders: {
      knowledge: '## Source Documents',
      memories: '## Additional Context',
    },
    collectionWeights: {
      memories: 0.5,
      skills: 0.3,
      knowledge: 2.0,
    },
    preamble: 'Answer based primarily on the source documents below. Use additional context only for supplementary information.',
  },
};

/** Resolve a template by ID string or return a custom PromptTemplate object */
export function resolveTemplate(templateOrId: string | PromptTemplate): PromptTemplate {
  if (typeof templateOrId === 'string') {
    const builtin = BUILTIN_TEMPLATES[templateOrId];
    if (!builtin) {
      throw new Error(`Unknown template: "${templateOrId}". Available: ${Object.keys(BUILTIN_TEMPLATES).join(', ')}`);
    }
    return builtin;
  }
  return templateOrId;
}

/** List all available built-in template summaries */
export function listTemplates(): Array<{ id: string; name: string; sectionOrder: string[]; hasWeights: boolean }> {
  return Object.values(BUILTIN_TEMPLATES).map(t => ({
    id: t.id,
    name: t.name,
    sectionOrder: t.sectionOrder,
    hasWeights: t.collectionWeights != null,
  }));
}
