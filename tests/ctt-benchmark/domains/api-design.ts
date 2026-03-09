/**
 * Domain 2: "API Design Standards" — English, procedural knowledge
 * Tests skill recall and procedural context
 */
import type { BenchmarkDomain } from '../types.js';

export const apiDesignDomain: BenchmarkDomain = {
  name: 'APIDesign',
  description: 'API design standards and procedural knowledge (English)',
  agentId: 'ctt-bench-agent',
  userId: 'backend-lead',
  seedData: {
    memories: [
      {
        content: 'We switched from REST to GraphQL for the dashboard API because the frontend needed flexible queries. REST remains for public API and webhooks.',
        tags: ['graphql', 'rest', 'api', 'architecture'],
        category: 'decision',
      },
      {
        content: 'Rate limiting: 100 requests/minute for free tier, 1000/min for pro, 10000/min for enterprise. Implemented via Redis sliding window counter.',
        tags: ['rate-limiting', 'redis', 'tiers'],
        category: 'fact',
      },
      {
        content: 'Bug: API was returning 200 for not-found resources instead of 404. Fixed by adding strict resource existence check middleware. Deployed 2024-12-15.',
        tags: ['bug', 'http-status', '404', 'middleware'],
        category: 'issue',
      },
      {
        content: 'Versioning: We use URL-based versioning (/v1/, /v2/) not header-based. Breaking changes get a new major version. Non-breaking additions are backward compatible.',
        tags: ['versioning', 'api', 'breaking-changes'],
        category: 'decision',
      },
    ],
    skills: [
      {
        content: 'Error handling pattern: 1) Catch at controller level 2) Map to standard error codes (ERR_NOT_FOUND, ERR_VALIDATION, ERR_AUTH, ERR_INTERNAL) 3) Return RFC 7807 Problem Details with type URI, title, status, detail fields 4) Log full stack trace at ERROR level 5) Never expose internal details to client',
        tags: ['error-handling', 'api', 'pattern'],
        category: 'procedure',
      },
      {
        content: 'Authentication flow: 1) Client sends credentials to POST /auth/login 2) Server validates against Auth0 3) Returns access_token (15min) + refresh_token (7d) 4) Client includes Bearer token in Authorization header 5) On 401, client uses refresh_token to get new access_token 6) On refresh failure, redirect to login',
        tags: ['authentication', 'flow', 'jwt', 'auth0'],
        category: 'procedure',
      },
      {
        content: 'Pagination: Use cursor-based pagination for all list endpoints. Response includes { data: [], meta: { cursor, hasMore, totalCount } }. Cursor is base64-encoded composite key. Never use offset pagination for large datasets.',
        tags: ['pagination', 'cursor', 'api'],
        category: 'procedure',
      },
      {
        content: 'Input validation: Use Zod schemas at the controller layer. Define schemas in /schemas/{resource}.ts files. Validate before business logic. Return 422 with validation errors in RFC 7807 format with "errors" extension array.',
        tags: ['validation', 'zod', 'input'],
        category: 'procedure',
      },
    ],
    knowledge: [
      {
        content: 'Webhook delivery: POST to subscriber URL with JSON payload. Include X-Webhook-Signature header (HMAC-SHA256). Retry 3 times with exponential backoff (1s, 5s, 25s). Log delivery status. Disable after 5 consecutive failures.',
        tags: ['webhooks', 'delivery', 'security'],
        source: 'webhook-docs',
      },
      {
        content: 'Database query optimization guide: 1) Add composite indexes for common WHERE+ORDER BY combinations 2) Use EXPLAIN ANALYZE before and after 3) Avoid SELECT * — specify columns 4) Use connection pooling (pgBouncer, max 20 connections) 5) Slow query threshold: 100ms — alert if exceeded',
        tags: ['database', 'performance', 'optimization'],
        source: 'perf-guide',
      },
    ],
  },
  testQueries: [
    {
      query: 'How should we handle API errors?',
      expectedTopics: ['error handling', 'RFC 7807'],
      expectedFacts: ['RFC 7807', 'Problem Details', 'ERR_NOT_FOUND', 'controller level'],
    },
    {
      query: 'What is our auth strategy?',
      expectedTopics: ['authentication', 'JWT'],
      expectedFacts: ['Auth0', 'access_token', 'refresh_token', '15min', 'Bearer'],
    },
    {
      query: 'How does pagination work in our API?',
      expectedTopics: ['pagination', 'cursor'],
      expectedFacts: ['cursor-based', 'base64', 'hasMore', 'never use offset'],
    },
    {
      query: 'What are the rate limits per tier?',
      expectedTopics: ['rate limiting', 'tiers'],
      expectedFacts: ['100 requests/minute', '1000/min', '10000/min', 'Redis', 'sliding window'],
    },
    {
      query: 'How do we handle webhook deliveries?',
      expectedTopics: ['webhooks', 'delivery'],
      expectedFacts: ['HMAC-SHA256', 'X-Webhook-Signature', 'retry 3 times', 'exponential backoff'],
    },
  ],
};
