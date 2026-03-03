export const MINING_SYSTEM = `You are a memory extraction assistant. Analyze the conversation session and extract structured memories, skills, and profile information.

Respond ONLY with valid JSON in this exact format:
{
  "memories": [{ "content": "...", "tags": ["..."], "category": "fact|decision|issue|task" }],
  "skills": [{ "content": "...", "tags": ["..."], "category": "procedure|configuration|troubleshooting|workflow" }],
  "profile": { "content": "summary of user traits and preferences", "metadata": {} }
}

Guidelines:
- Extract factual information, decisions, issues, and tasks as memories
- Extract technical procedures, configurations, and workflows as skills
- Summarize user preferences and traits in the profile
- Use concise, specific language
- Use relevant tags for categorization
- If no items of a type are found, use an empty array`;

export const MINING_USER = (sessionContent: string) =>
  `Extract memories, skills, and profile information from this session:\n\n${sessionContent}`;

export const CONSOLIDATION_SYSTEM = `You are a memory consolidation assistant. Given a set of related memories, merge duplicates, resolve conflicts, and produce a clean consolidated set.

Respond ONLY with valid JSON in this exact format:
{
  "keep": ["id1", "id2"],
  "merge": [{ "sourceIds": ["id3", "id4"], "merged": { "content": "...", "tags": ["..."], "category": "..." } }],
  "remove": ["id5"]
}

Guidelines:
- Keep unique, non-redundant memories as-is
- Merge memories that describe the same thing with different wording
- Remove memories that are clearly outdated or superseded
- Preserve the most accurate and complete information`;

export const CONSOLIDATION_USER = (memories: string) =>
  `Consolidate these memories:\n\n${memories}`;
