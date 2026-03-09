import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: ['src/ai/index.ts'],
    outDir: 'dist/ai',
    format: ['esm'],
    dts: true,
    sourcemap: true,
  },
  {
    entry: ['src/rag/index.ts'],
    outDir: 'dist/rag',
    format: ['esm'],
    dts: true,
    sourcemap: true,
  },
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    sourcemap: true,
  },
  {
    entry: ['src/mcp.ts'],
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    sourcemap: true,
  },
  {
    entry: ['src/http.ts'],
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    sourcemap: true,
  },
  {
    entry: ['src/neural/index.ts'],
    outDir: 'dist/neural',
    format: ['esm'],
    dts: true,
    sourcemap: true,
    external: ['@huggingface/transformers'],
  },
]);
