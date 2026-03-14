/**
 * A2E protocol knowledge — primitives documentation and workflow examples.
 *
 * Ingests the A2E protocol specification into RepoMemory's knowledge and
 * skills collections so the LLM learns how to define valid A2E workflows.
 *
 * Knowledge entries: one per primitive (8 operations + JSONL format).
 * Skill entries: workflow examples for common patterns.
 *
 * Reference: A2E Protocol Specification v1.0.0
 * https://github.com/MauricioPerera/a2e
 */

import type { RepoMemory } from '../index.js';

export interface IngestA2EKnowledgeResult {
  /** Number of knowledge entries saved (primitives + format) */
  knowledge: number;
  /** Number of skill entries saved (workflow examples) */
  skills: number;
  /** Total entries */
  total: number;
}

/**
 * Ingest A2E protocol documentation into RepoMemory.
 *
 * - Saves each primitive as a knowledge entry (agentId-scoped).
 * - Saves workflow examples as skills (agentId-scoped).
 * - Uses saveOrUpdate with source-based dedup — safe to call repeatedly.
 *
 * @param repo - RepoMemory instance
 * @param agentId - Agent scope for the knowledge
 */
export function ingestA2EKnowledge(
  repo: RepoMemory,
  agentId: string,
): IngestA2EKnowledgeResult {
  const result: IngestA2EKnowledgeResult = { knowledge: 0, skills: 0, total: 0 };

  // Ingest primitive documentation as knowledge
  for (const entry of PRIMITIVE_DOCS) {
    repo.knowledge.saveOrUpdate(agentId, {
      content: entry.content,
      tags: ['a2e', 'a2e-primitive', ...entry.tags],
      source: `a2e-spec:${entry.id}`,
      questions: entry.questions,
    });
    result.knowledge++;
  }

  // Ingest JSONL format documentation
  repo.knowledge.saveOrUpdate(agentId, {
    content: JSONL_FORMAT_DOC,
    tags: ['a2e', 'a2e-format', 'jsonl', 'workflow'],
    source: 'a2e-spec:jsonl-format',
    questions: [
      'how to write a2e workflow',
      'a2e jsonl format',
      'como definir un workflow a2e',
      'workflow format',
      'a2e message types',
    ],
  });
  result.knowledge++;

  // Ingest workflow examples as skills
  for (const example of WORKFLOW_EXAMPLES) {
    repo.skills.saveOrUpdate(agentId, {
      content: example.content,
      tags: ['a2e', 'a2e-example', ...example.tags],
      category: 'procedure',
    });
    result.skills++;
  }

  result.total = result.knowledge + result.skills;
  return result;
}

// ---------------------------------------------------------------------------
// A2E Primitive Documentation
// ---------------------------------------------------------------------------

interface PrimitiveDoc {
  id: string;
  content: string;
  tags: string[];
  questions: string[];
}

const PRIMITIVE_DOCS: PrimitiveDoc[] = [
  {
    id: 'ApiCall',
    content: `A2E Primitive: ApiCall
Executes HTTP requests to external APIs.

Required fields:
- method (string): HTTP verb — GET, POST, PUT, DELETE, PATCH
- url (string): Endpoint URL. Supports path references like {/workflow/data/id}
- outputPath (string): Where to store the response in the workflow data model. Must start with /workflow/

Optional fields:
- headers (object): HTTP headers. Supports credential references: {"Authorization": {"credentialRef": {"id": "my-api-key"}}}
- body (object|string|number|array|null): Request payload for POST/PUT/PATCH
- timeout (number): Milliseconds before abort. Min 1000, max 300000, default 30000

Example operationUpdate:
{"type":"operationUpdate","operationId":"fetch-users","operation":{"ApiCall":{"method":"GET","url":"https://api.example.com/users","outputPath":"/workflow/users"}}}`,
    tags: ['apicall', 'http', 'api', 'request'],
    questions: [
      'how to call an api with a2e',
      'como hacer una peticion http',
      'a2e api call',
      'how to make http request',
      'como usar ApiCall',
    ],
  },
  {
    id: 'FilterData',
    content: `A2E Primitive: FilterData
Filters arrays using conditional expressions.

Required fields:
- inputPath (string): Source array location. Must start with /workflow/
- conditions (array): Array of filter conditions. Each condition has:
  - field (string): Field name to evaluate
  - operator (string): Comparison — ==, !=, >, <, >=, <=, in, contains, startsWith, endsWith
  - value (any): Value to compare against
- outputPath (string): Where to store filtered results. Must start with /workflow/

Example operationUpdate:
{"type":"operationUpdate","operationId":"active-users","operation":{"FilterData":{"inputPath":"/workflow/users","conditions":[{"field":"status","operator":"==","value":"active"}],"outputPath":"/workflow/activeUsers"}}}`,
    tags: ['filterdata', 'filter', 'array', 'conditions'],
    questions: [
      'how to filter data in a2e',
      'como filtrar datos',
      'a2e filter conditions',
      'filter array a2e',
      'como usar FilterData',
    ],
  },
  {
    id: 'TransformData',
    content: `A2E Primitive: TransformData
Transforms data structure and content.

Required fields:
- inputPath (string): Source data location. Must start with /workflow/
- transform (string): Transform type — map, sort, group, aggregate, select
- outputPath (string): Where to store transformed results. Must start with /workflow/

Optional fields:
- config (object): Transform-specific parameters (e.g., sort field, group key, map expression)

Example operationUpdate:
{"type":"operationUpdate","operationId":"sort-by-name","operation":{"TransformData":{"inputPath":"/workflow/activeUsers","transform":"sort","config":{"field":"name","order":"asc"},"outputPath":"/workflow/sortedUsers"}}}`,
    tags: ['transformdata', 'transform', 'map', 'sort', 'group'],
    questions: [
      'how to transform data in a2e',
      'como transformar datos',
      'a2e sort data',
      'a2e map transform',
      'como usar TransformData',
    ],
  },
  {
    id: 'Conditional',
    content: `A2E Primitive: Conditional
Branches execution based on a condition.

Required fields:
- condition (object): Expression to evaluate:
  - path (string): Data path to check. Must start with /workflow/
  - operator (string): Comparison — ==, !=, >, <, >=, <=, exists, empty
  - value (any, optional): Value to compare against
- ifTrue (array): List of operationId strings to execute when condition is true

Optional fields:
- ifFalse (array): List of operationId strings to execute when condition is false

Example operationUpdate:
{"type":"operationUpdate","operationId":"check-results","operation":{"Conditional":{"condition":{"path":"/workflow/users","operator":"!=","value":[]},"ifTrue":["process-users"],"ifFalse":["handle-empty"]}}}`,
    tags: ['conditional', 'branch', 'if', 'condition'],
    questions: [
      'how to add conditions in a2e',
      'como hacer condicionales',
      'a2e if else',
      'conditional branch a2e',
      'como usar Conditional',
    ],
  },
  {
    id: 'Loop',
    content: `A2E Primitive: Loop
Iterates operations over each element of an array.

Required fields:
- inputPath (string): Array to iterate over. Must start with /workflow/
- operations (array): List of operationId strings to execute per element. Min 1 item.

Optional fields:
- outputPath (string): Where to store accumulated results. Must start with /workflow/

Example operationUpdate:
{"type":"operationUpdate","operationId":"process-each","operation":{"Loop":{"inputPath":"/workflow/users","operations":["enrich-user","save-user"],"outputPath":"/workflow/processedUsers"}}}`,
    tags: ['loop', 'iterate', 'foreach', 'array'],
    questions: [
      'how to loop in a2e',
      'como iterar datos',
      'a2e foreach',
      'loop over array a2e',
      'como usar Loop',
    ],
  },
  {
    id: 'StoreData',
    content: `A2E Primitive: StoreData
Persists data to a storage backend.

Required fields:
- inputPath (string): Data to persist. Must start with /workflow/
- storage (string): Backend type — localStorage, sessionStorage, file
- key (string): Storage identifier or file path. Min 1 character.

Example operationUpdate:
{"type":"operationUpdate","operationId":"save-results","operation":{"StoreData":{"inputPath":"/workflow/processedUsers","storage":"file","key":"output/users.json"}}}`,
    tags: ['storedata', 'store', 'persist', 'save', 'file'],
    questions: [
      'how to store data in a2e',
      'como guardar datos',
      'a2e save to file',
      'persist data a2e',
      'como usar StoreData',
    ],
  },
  {
    id: 'Wait',
    content: `A2E Primitive: Wait
Pauses workflow execution for a specified duration.

Required fields:
- duration (number): Milliseconds to wait. Min 0, max 600000.

Example operationUpdate:
{"type":"operationUpdate","operationId":"pause","operation":{"Wait":{"duration":2000}}}`,
    tags: ['wait', 'pause', 'delay', 'sleep'],
    questions: [
      'how to wait in a2e',
      'como pausar workflow',
      'a2e delay',
      'wait between operations',
      'como usar Wait',
    ],
  },
  {
    id: 'MergeData',
    content: `A2E Primitive: MergeData
Combines multiple data sources into one.

Required fields:
- sources (array): Array of input paths to merge. Min 2 items. Each must start with /workflow/
- strategy (string): How to combine — concat, union, intersect, deepMerge
- outputPath (string): Where to store merged result. Must start with /workflow/

Example operationUpdate:
{"type":"operationUpdate","operationId":"combine-data","operation":{"MergeData":{"sources":["/workflow/usersA","/workflow/usersB"],"strategy":"union","outputPath":"/workflow/allUsers"}}}`,
    tags: ['mergedata', 'merge', 'combine', 'union', 'concat'],
    questions: [
      'how to merge data in a2e',
      'como combinar datos',
      'a2e merge arrays',
      'combine data sources a2e',
      'como usar MergeData',
    ],
  },
];

// ---------------------------------------------------------------------------
// JSONL Format Documentation
// ---------------------------------------------------------------------------

const JSONL_FORMAT_DOC = `A2E Workflow Format (JSONL)
A workflow is a sequence of JSON lines. Each line is a message with a "type" field.

Message types:

1. operationUpdate — Defines or modifies an operation in the workflow.
   Fields:
   - type: "operationUpdate" (required)
   - operationId: string identifier matching ^[a-zA-Z0-9_-]+$ (required)
   - operation: object with exactly one key being the primitive name (ApiCall, FilterData, TransformData, Conditional, Loop, StoreData, Wait, MergeData) and its configuration as value (required)

2. beginExecution — Signals the start of workflow execution and defines the order.
   Fields:
   - type: "beginExecution" (required)
   - executionId: string identifier matching ^[a-zA-Z0-9_-]+$ (required)
   - operationOrder: array of operationId strings in execution order (required, min 1)

Data model:
- All data paths use /workflow/ prefix (e.g., /workflow/users, /workflow/result)
- Operations read from and write to this shared data model
- Path references in URLs use curly braces: {/workflow/data/id}

Credential references:
- Use {"credentialRef": {"id": "credential-name"}} in headers for secure credential injection
- The executor resolves credentials at runtime — never hardcode secrets in workflows

Complete workflow example:
{"type":"operationUpdate","operationId":"get-data","operation":{"ApiCall":{"method":"GET","url":"https://api.example.com/items","outputPath":"/workflow/items"}}}
{"type":"operationUpdate","operationId":"filter-active","operation":{"FilterData":{"inputPath":"/workflow/items","conditions":[{"field":"active","operator":"==","value":true}],"outputPath":"/workflow/activeItems"}}}
{"type":"beginExecution","executionId":"run-1","operationOrder":["get-data","filter-active"]}`;

// ---------------------------------------------------------------------------
// Workflow Examples (Skills)
// ---------------------------------------------------------------------------

interface WorkflowExample {
  content: string;
  tags: string[];
}

const WORKFLOW_EXAMPLES: WorkflowExample[] = [
  {
    content: `Para consultar una API y filtrar resultados: [A2E:
{"type":"operationUpdate","operationId":"fetch","operation":{"ApiCall":{"method":"GET","url":"https://api.example.com/data","outputPath":"/workflow/data"}}}
{"type":"operationUpdate","operationId":"filter","operation":{"FilterData":{"inputPath":"/workflow/data","conditions":[{"field":"status","operator":"==","value":"active"}],"outputPath":"/workflow/filtered"}}}
{"type":"beginExecution","executionId":"exec-1","operationOrder":["fetch","filter"]}]`,
    tags: ['apicall', 'filterdata', 'query-filter'],
  },
  {
    content: `Para hacer POST a una API con body: [A2E:
{"type":"operationUpdate","operationId":"create","operation":{"ApiCall":{"method":"POST","url":"https://api.example.com/items","headers":{"Content-Type":"application/json"},"body":{"name":"new item","value":42},"outputPath":"/workflow/created"}}}
{"type":"beginExecution","executionId":"exec-1","operationOrder":["create"]}]`,
    tags: ['apicall', 'post', 'create'],
  },
  {
    content: `Para consultar API con autenticacion segura: [A2E:
{"type":"operationUpdate","operationId":"secure-fetch","operation":{"ApiCall":{"method":"GET","url":"https://api.example.com/protected","headers":{"Authorization":{"credentialRef":{"id":"api-token"}}},"outputPath":"/workflow/data"}}}
{"type":"beginExecution","executionId":"exec-1","operationOrder":["secure-fetch"]}]`,
    tags: ['apicall', 'auth', 'credentials'],
  },
  {
    content: `Para obtener datos, filtrar y transformar: [A2E:
{"type":"operationUpdate","operationId":"fetch","operation":{"ApiCall":{"method":"GET","url":"https://api.example.com/users","outputPath":"/workflow/users"}}}
{"type":"operationUpdate","operationId":"filter","operation":{"FilterData":{"inputPath":"/workflow/users","conditions":[{"field":"age","operator":">=","value":18}],"outputPath":"/workflow/adults"}}}
{"type":"operationUpdate","operationId":"sort","operation":{"TransformData":{"inputPath":"/workflow/adults","transform":"sort","config":{"field":"name","order":"asc"},"outputPath":"/workflow/sorted"}}}
{"type":"beginExecution","executionId":"exec-1","operationOrder":["fetch","filter","sort"]}]`,
    tags: ['apicall', 'filterdata', 'transformdata', 'pipeline'],
  },
  {
    content: `Para iterar sobre elementos y procesar cada uno: [A2E:
{"type":"operationUpdate","operationId":"get-items","operation":{"ApiCall":{"method":"GET","url":"https://api.example.com/items","outputPath":"/workflow/items"}}}
{"type":"operationUpdate","operationId":"enrich","operation":{"ApiCall":{"method":"GET","url":"https://api.example.com/details/{/workflow/items/id}","outputPath":"/workflow/enriched"}}}
{"type":"operationUpdate","operationId":"loop","operation":{"Loop":{"inputPath":"/workflow/items","operations":["enrich"],"outputPath":"/workflow/enrichedItems"}}}
{"type":"beginExecution","executionId":"exec-1","operationOrder":["get-items","loop"]}]`,
    tags: ['apicall', 'loop', 'iterate'],
  },
  {
    content: `Para combinar datos de multiples fuentes: [A2E:
{"type":"operationUpdate","operationId":"source-a","operation":{"ApiCall":{"method":"GET","url":"https://api-a.example.com/data","outputPath":"/workflow/dataA"}}}
{"type":"operationUpdate","operationId":"source-b","operation":{"ApiCall":{"method":"GET","url":"https://api-b.example.com/data","outputPath":"/workflow/dataB"}}}
{"type":"operationUpdate","operationId":"merge","operation":{"MergeData":{"sources":["/workflow/dataA","/workflow/dataB"],"strategy":"concat","outputPath":"/workflow/combined"}}}
{"type":"beginExecution","executionId":"exec-1","operationOrder":["source-a","source-b","merge"]}]`,
    tags: ['apicall', 'mergedata', 'multiple-sources'],
  },
  {
    content: `Para ejecutar condicionalmente segun resultado: [A2E:
{"type":"operationUpdate","operationId":"check","operation":{"ApiCall":{"method":"GET","url":"https://api.example.com/status","outputPath":"/workflow/status"}}}
{"type":"operationUpdate","operationId":"process","operation":{"ApiCall":{"method":"POST","url":"https://api.example.com/process","body":{"source":"{/workflow/status}"},"outputPath":"/workflow/result"}}}
{"type":"operationUpdate","operationId":"fallback","operation":{"StoreData":{"inputPath":"/workflow/status","storage":"file","key":"error-log.json"}}}
{"type":"operationUpdate","operationId":"decide","operation":{"Conditional":{"condition":{"path":"/workflow/status/ok","operator":"==","value":true},"ifTrue":["process"],"ifFalse":["fallback"]}}}
{"type":"beginExecution","executionId":"exec-1","operationOrder":["check","decide"]}]`,
    tags: ['conditional', 'apicall', 'storedata', 'branching'],
  },
];
