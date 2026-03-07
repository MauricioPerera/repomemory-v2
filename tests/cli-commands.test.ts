import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';
import { cmdExport } from '../src/cli/commands/export.js';
import { cmdImport } from '../src/cli/commands/import.js';
import { cmdRecall } from '../src/cli/commands/recall.js';
import { cmdCleanup } from '../src/cli/commands/cleanup.js';
import type { ParsedArgs } from '../src/cli/parser.js';

function makeArgs(overrides: Partial<ParsedArgs> & { flags?: Record<string, string | boolean> }): ParsedArgs {
  return {
    command: '',
    positional: [],
    flags: {},
    ...overrides,
  };
}

describe('CLI Commands', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-cli-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('export', () => {
    it('exports entities to a JSON file', () => {
      const mem = new RepoMemory({ dir });
      mem.memories.save('a1', 'u1', { content: 'test memory', tags: ['t1'] });
      mem.skills.save('a1', undefined, { content: 'test skill', tags: ['s1'] });

      const outFile = join(dir, 'export.json');
      cmdExport(makeArgs({ command: 'export', subcommand: outFile, flags: { dir } }));

      expect(existsSync(outFile)).toBe(true);
      const data = JSON.parse(readFileSync(outFile, 'utf8'));
      expect(data.version).toBe(1);
      expect(data.entities.memories).toHaveLength(1);
      expect(data.entities.skills).toHaveLength(1);
    });

    it('supports --output flag', () => {
      const mem = new RepoMemory({ dir });
      mem.memories.save('a1', 'u1', { content: 'test' });

      const outFile = join(dir, 'out.json');
      cmdExport(makeArgs({ command: 'export', flags: { dir, output: outFile } }));

      expect(existsSync(outFile)).toBe(true);
    });
  });

  describe('import', () => {
    it('imports entities from a JSON file', () => {
      // Create source data
      const srcDir = mkdtempSync(join(tmpdir(), 'rm-cli-src-'));
      const srcMem = new RepoMemory({ dir: srcDir });
      srcMem.memories.save('a1', 'u1', { content: 'imported memory', tags: ['t1'] });
      srcMem.skills.save('a1', undefined, { content: 'imported skill' });

      const exportFile = join(dir, 'data.json');
      cmdExport(makeArgs({ command: 'export', subcommand: exportFile, flags: { dir: srcDir } }));

      // Import into a new dir
      const targetDir = mkdtempSync(join(tmpdir(), 'rm-cli-tgt-'));
      new RepoMemory({ dir: targetDir }); // init

      cmdImport(makeArgs({ command: 'import', subcommand: exportFile, flags: { dir: targetDir } }));

      const target = new RepoMemory({ dir: targetDir });
      expect(target.stats().memories).toBe(1);
      expect(target.stats().skills).toBe(1);

      rmSync(srcDir, { recursive: true, force: true });
      rmSync(targetDir, { recursive: true, force: true });
    });

    it('supports --skip-existing flag', () => {
      const mem = new RepoMemory({ dir });
      mem.memories.save('a1', 'u1', { content: 'existing' });

      const exportFile = join(dir, 'data.json');
      cmdExport(makeArgs({ command: 'export', subcommand: exportFile, flags: { dir } }));

      // Import again with skip-existing — should not crash
      cmdImport(makeArgs({ command: 'import', subcommand: exportFile, flags: { dir, 'skip-existing': true } }));

      expect(mem.stats().memories).toBe(1); // still 1
    });
  });

  describe('recall', () => {
    it('recalls context for query', () => {
      const mem = new RepoMemory({ dir });
      mem.memories.save('a1', 'u1', { content: 'TypeScript strict mode is required', tags: ['typescript'] });
      mem.memories.save('a1', 'u1', { content: 'Docker compose for deployment', tags: ['docker'] });
      mem.flush();

      // Just verify it doesn't throw
      cmdRecall(makeArgs({
        command: 'recall',
        subcommand: 'typescript',
        flags: { dir, agent: 'a1', user: 'u1' },
      }));
    });
  });

  describe('cleanup', () => {
    it('runs cleanup with dry-run', () => {
      const mem = new RepoMemory({ dir });
      mem.memories.save('a1', 'u1', { content: 'test', tags: [] });

      // Just verify it doesn't throw
      cmdCleanup(makeArgs({
        command: 'cleanup',
        flags: { dir, 'max-age': '90', 'dry-run': true },
      }));
    });

    it('runs cleanup without dry-run', () => {
      const mem = new RepoMemory({ dir });
      mem.memories.save('a1', 'u1', { content: 'test', tags: [] });

      cmdCleanup(makeArgs({
        command: 'cleanup',
        flags: { dir, 'max-age': '90' },
      }));
    });
  });

  describe('export/import roundtrip', () => {
    it('full roundtrip preserves data', () => {
      const srcDir = mkdtempSync(join(tmpdir(), 'rm-cli-rt-src-'));
      const tgtDir = mkdtempSync(join(tmpdir(), 'rm-cli-rt-tgt-'));
      const exportFile = join(dir, 'roundtrip.json');

      const src = new RepoMemory({ dir: srcDir });
      src.memories.save('a1', 'u1', { content: 'mem1', tags: ['t1'] });
      src.memories.save('a1', 'u1', { content: 'mem2', tags: ['t2'] });
      src.skills.save('a1', undefined, { content: 'skill1', category: 'procedure' });
      src.knowledge.save('a1', undefined, { content: 'know1', tags: ['k'] });

      cmdExport(makeArgs({ command: 'export', subcommand: exportFile, flags: { dir: srcDir } }));

      new RepoMemory({ dir: tgtDir }); // init
      cmdImport(makeArgs({ command: 'import', subcommand: exportFile, flags: { dir: tgtDir } }));

      const tgt = new RepoMemory({ dir: tgtDir });
      expect(tgt.stats().memories).toBe(2);
      expect(tgt.stats().skills).toBe(1);
      expect(tgt.stats().knowledge).toBe(1);

      rmSync(srcDir, { recursive: true, force: true });
      rmSync(tgtDir, { recursive: true, force: true });
    });
  });
});
