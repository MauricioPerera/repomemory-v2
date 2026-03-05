/**
 * Query expansion via synonym/abbreviation mapping.
 * Adds related terms to improve recall without embeddings.
 * Focused on software engineering and technical terms.
 */

const SYNONYMS: Record<string, string[]> = {
  // Languages & frameworks
  ts: ['typescript'],
  js: ['javascript'],
  py: ['python'],
  rb: ['ruby'],
  rs: ['rust'],
  cpp: ['cplusplus'],
  csharp: ['dotnet'],
  react: ['reactjs'],
  vue: ['vuejs'],
  node: ['nodejs'],
  next: ['nextjs'],
  nuxt: ['nuxtjs'],
  deno: ['denojs'],
  bun: ['bunjs'],

  // Databases
  db: ['database'],
  sql: ['database', 'query'],
  pg: ['postgres', 'postgresql'],
  mongo: ['mongodb'],
  redis: ['cache'],
  mysql: ['database'],

  // DevOps / Infra
  k8s: ['kubernetes'],
  ci: ['continuous', 'integration'],
  cd: ['continuous', 'deployment'],
  docker: ['container'],
  aws: ['amazon', 'cloud'],
  gcp: ['google', 'cloud'],

  // Concepts
  auth: ['authentication', 'authorization'],
  authn: ['authentication'],
  authz: ['authorization'],
  api: ['endpoint', 'rest'],
  ui: ['interface', 'frontend'],
  ux: ['experience', 'usability'],
  perf: ['performance', 'optimization'],
  config: ['configuration', 'settings'],
  env: ['environment', 'variables'],
  deps: ['dependencies'],
  repo: ['repository'],
  pkg: ['package'],
  lib: ['library'],
  func: ['function'],
  fn: ['function'],
  err: ['error'],
  msg: ['message'],
  req: ['request'],
  res: ['response'],
  dev: ['development'],
  prod: ['production'],
  test: ['testing'],
  spec: ['specification'],
  doc: ['documentation'],
  docs: ['documentation'],
  async: ['asynchronous'],
  sync: ['synchronous'],

  // Actions
  fix: ['bug', 'repair'],
  debug: ['troubleshoot', 'diagnose'],
  deploy: ['release', 'ship'],
  refactor: ['restructure', 'improve'],
  optimize: ['performance', 'improve'],
  migrate: ['migration', 'upgrade'],
  install: ['setup', 'configure'],
};

// Build reverse map for bidirectional lookup
const reverseMap = new Map<string, Set<string>>();
for (const [abbrev, expansions] of Object.entries(SYNONYMS)) {
  for (const exp of expansions) {
    if (!reverseMap.has(exp)) reverseMap.set(exp, new Set());
    reverseMap.get(exp)!.add(abbrev);
  }
}

/**
 * Expand a query by adding synonyms/abbreviations for each token.
 * Original tokens are always preserved. Expansions are appended.
 */
export function expandQuery(query: string): string {
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  const expanded = new Set(tokens);

  for (const token of tokens) {
    // Forward: abbreviation → full terms
    const synonyms = SYNONYMS[token];
    if (synonyms) {
      for (const s of synonyms) expanded.add(s);
    }

    // Reverse: full term → abbreviations
    const reverses = reverseMap.get(token);
    if (reverses) {
      for (const r of reverses) expanded.add(r);
    }
  }

  return [...expanded].join(' ');
}
