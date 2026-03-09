/**
 * Domain 1: "Proyecto TechStartup" — Spanish, technical decisions
 * Tests cross-lingual recall (queries in Spanish, some data in English)
 */
import type { BenchmarkDomain } from '../types.js';

export const techStartupDomain: BenchmarkDomain = {
  name: 'TechStartup',
  description: 'Technical decisions for a startup project (Spanish + English mix)',
  agentId: 'ctt-bench-agent',
  userId: 'startup-founder',
  seedData: {
    memories: [
      {
        content: 'Decidimos usar PostgreSQL como base de datos principal por su soporte de JSONB y extensiones como PostGIS. MySQL fue descartado por limitaciones en tipos de datos complejos.',
        tags: ['database', 'postgresql', 'architecture', 'decision'],
        category: 'decision',
      },
      {
        content: 'El equipo eligió TypeScript sobre JavaScript puro. Razón: type safety reduce bugs en producción un 40% según nuestras métricas del proyecto anterior.',
        tags: ['typescript', 'language', 'decision'],
        category: 'decision',
      },
      {
        content: 'Deploy strategy: Docker containers on AWS ECS Fargate. No queremos administrar servidores. CI/CD con GitHub Actions → ECR → ECS.',
        tags: ['deploy', 'docker', 'aws', 'ecs', 'ci-cd'],
        category: 'decision',
      },
      {
        content: 'Authentication: Auth0 para SSO empresarial, JWT tokens con refresh rotation cada 15 minutos. MFA obligatorio para admin roles.',
        tags: ['auth', 'auth0', 'jwt', 'security'],
        category: 'decision',
      },
      {
        content: 'Sprint planning meeting — we agreed on 2-week sprints with Thursday demos. Retrospectives every other sprint. Jira for tracking.',
        tags: ['process', 'agile', 'sprint', 'planning'],
        category: 'fact',
      },
      {
        content: 'Performance requirement: API p99 latency must be under 200ms. Current baseline is 350ms. Need to add Redis caching layer for hot queries.',
        tags: ['performance', 'redis', 'caching', 'requirements'],
        category: 'issue',
      },
      {
        content: 'El presupuesto mensual de infraestructura es $2,500. AWS costs breakdown: ECS $800, RDS $600, S3+CloudFront $300, misc $800.',
        tags: ['budget', 'aws', 'infrastructure', 'costs'],
        category: 'fact',
      },
    ],
    skills: [
      {
        content: 'Para crear un nuevo microservicio: 1) Usar template en /templates/service-starter 2) Configurar Dockerfile 3) Agregar al docker-compose.yml 4) Crear pipeline en .github/workflows/ 5) Registrar en API Gateway',
        tags: ['microservice', 'template', 'devops'],
        category: 'procedure',
      },
      {
        content: 'Database migration process: 1) Create migration file with `npm run migrate:create` 2) Write up/down SQL 3) Test locally with `npm run migrate:test` 4) PR review 5) Run in staging 6) Run in production during maintenance window',
        tags: ['database', 'migration', 'process'],
        category: 'procedure',
      },
    ],
    knowledge: [
      {
        content: 'API Design Standard: All endpoints use kebab-case URLs, JSON:API format for responses, include pagination via cursor tokens. Error responses follow RFC 7807 Problem Details.',
        tags: ['api', 'standards', 'rest'],
        source: 'architecture-docs',
      },
      {
        content: 'Naming conventions: database tables are snake_case plural (e.g., user_profiles), TypeScript interfaces are PascalCase (e.g., UserProfile), API fields are camelCase.',
        tags: ['conventions', 'naming', 'standards'],
        source: 'style-guide',
      },
    ],
  },
  testQueries: [
    {
      query: '¿Qué base de datos elegimos y por qué?',
      expectedTopics: ['PostgreSQL', 'database'],
      expectedFacts: ['PostgreSQL', 'JSONB', 'MySQL descartado'],
    },
    {
      query: '¿Cuál es nuestra estrategia de deploy?',
      expectedTopics: ['Docker', 'deploy', 'AWS'],
      expectedFacts: ['Docker', 'ECS Fargate', 'GitHub Actions'],
    },
    {
      query: '¿Cómo manejamos la autenticación?',
      expectedTopics: ['authentication', 'JWT'],
      expectedFacts: ['Auth0', 'JWT', 'refresh rotation', 'MFA'],
    },
    {
      query: 'What is the monthly infrastructure budget?',
      expectedTopics: ['budget', 'infrastructure'],
      expectedFacts: ['$2,500', 'AWS', 'ECS', 'RDS'],
    },
    {
      query: '¿Cuáles son los estándares para diseñar APIs?',
      expectedTopics: ['API', 'standards'],
      expectedFacts: ['kebab-case', 'JSON:API', 'RFC 7807'],
    },
  ],
};
