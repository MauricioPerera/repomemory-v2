import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadFile, loadDirectory } from '../../src/rag/loader.js';

describe('loader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rag-loader-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // loadFile
  // -----------------------------------------------------------------------
  describe('loadFile', () => {
    it('loads a file with correct properties', () => {
      const filePath = join(tmpDir, 'test.md');
      writeFileSync(filePath, '# Hello\n\nWorld');

      const result = loadFile(filePath);
      expect(result.content).toBe('# Hello\n\nWorld');
      expect(result.filePath).toContain('test.md');
      expect(result.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO date
    });

    it('returns absolute path', () => {
      const filePath = join(tmpDir, 'abs.txt');
      writeFileSync(filePath, 'content');

      const result = loadFile(filePath);
      expect(result.filePath).toMatch(/^[A-Z]:\\/i); // Windows absolute path
    });

    it('throws for non-existent file', () => {
      expect(() => loadFile(join(tmpDir, 'nope.txt'))).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // loadDirectory
  // -----------------------------------------------------------------------
  describe('loadDirectory', () => {
    it('loads supported files recursively', () => {
      writeFileSync(join(tmpDir, 'readme.md'), '# Readme');
      writeFileSync(join(tmpDir, 'app.ts'), 'const x = 1;');
      writeFileSync(join(tmpDir, 'data.json'), '{}');
      mkdirSync(join(tmpDir, 'sub'));
      writeFileSync(join(tmpDir, 'sub', 'nested.txt'), 'nested content');

      const files = loadDirectory(tmpDir);
      expect(files.length).toBe(4);
      // Sorted by path
      const names = files.map(f => f.filePath.split(/[\\/]/).pop());
      expect(names).toContain('readme.md');
      expect(names).toContain('app.ts');
      expect(names).toContain('data.json');
      expect(names).toContain('nested.txt');
    });

    it('skips unsupported extensions', () => {
      writeFileSync(join(tmpDir, 'image.png'), 'binary');
      writeFileSync(join(tmpDir, 'doc.pdf'), 'binary');
      writeFileSync(join(tmpDir, 'ok.md'), '# OK');

      const files = loadDirectory(tmpDir);
      expect(files.length).toBe(1);
      expect(files[0].filePath).toContain('ok.md');
    });

    it('respects custom extensions filter', () => {
      writeFileSync(join(tmpDir, 'a.md'), 'md');
      writeFileSync(join(tmpDir, 'b.txt'), 'txt');
      writeFileSync(join(tmpDir, 'c.ts'), 'ts');

      const files = loadDirectory(tmpDir, { extensions: ['.md', '.txt'] });
      expect(files.length).toBe(2);
    });

    it('skips hidden directories', () => {
      mkdirSync(join(tmpDir, '.hidden'));
      writeFileSync(join(tmpDir, '.hidden', 'secret.md'), 'hidden');
      writeFileSync(join(tmpDir, 'visible.md'), 'visible');

      const files = loadDirectory(tmpDir);
      expect(files.length).toBe(1);
      expect(files[0].filePath).toContain('visible.md');
    });

    it('skips node_modules and .git', () => {
      mkdirSync(join(tmpDir, 'node_modules'));
      writeFileSync(join(tmpDir, 'node_modules', 'pkg.js'), 'pkg');
      mkdirSync(join(tmpDir, '.git'));
      writeFileSync(join(tmpDir, '.git', 'config'), 'git');
      writeFileSync(join(tmpDir, 'app.js'), 'app');

      const files = loadDirectory(tmpDir);
      expect(files.length).toBe(1);
    });

    it('respects maxDepth', () => {
      mkdirSync(join(tmpDir, 'a'));
      mkdirSync(join(tmpDir, 'a', 'b'));
      mkdirSync(join(tmpDir, 'a', 'b', 'c'));
      writeFileSync(join(tmpDir, 'a', 'top.md'), 'top');
      writeFileSync(join(tmpDir, 'a', 'b', 'mid.md'), 'mid');
      writeFileSync(join(tmpDir, 'a', 'b', 'c', 'deep.md'), 'deep');

      const files = loadDirectory(tmpDir, { maxDepth: 2 });
      const names = files.map(f => f.filePath.split(/[\\/]/).pop());
      expect(names).toContain('top.md');
      expect(names).toContain('mid.md');
      expect(names).not.toContain('deep.md');
    });

    it('skips files exceeding maxFileSize', () => {
      writeFileSync(join(tmpDir, 'big.md'), 'X'.repeat(2000));
      writeFileSync(join(tmpDir, 'small.md'), 'OK');

      const files = loadDirectory(tmpDir, { maxFileSize: 1000 });
      expect(files.length).toBe(1);
      expect(files[0].filePath).toContain('small.md');
    });

    it('skips empty files', () => {
      writeFileSync(join(tmpDir, 'empty.md'), '');
      writeFileSync(join(tmpDir, 'has-content.md'), 'content');

      const files = loadDirectory(tmpDir);
      expect(files.length).toBe(1);
      expect(files[0].filePath).toContain('has-content.md');
    });

    it('respects exclude patterns', () => {
      writeFileSync(join(tmpDir, 'keep.md'), 'keep');
      mkdirSync(join(tmpDir, 'vendor'));
      writeFileSync(join(tmpDir, 'vendor', 'skip.md'), 'skip');

      const files = loadDirectory(tmpDir, { exclude: ['vendor'] });
      expect(files.length).toBe(1);
      expect(files[0].filePath).toContain('keep.md');
    });

    it('returns files sorted by path', () => {
      writeFileSync(join(tmpDir, 'c.md'), 'c');
      writeFileSync(join(tmpDir, 'a.md'), 'a');
      writeFileSync(join(tmpDir, 'b.md'), 'b');

      const files = loadDirectory(tmpDir);
      const names = files.map(f => f.filePath.split(/[\\/]/).pop());
      expect(names).toEqual(['a.md', 'b.md', 'c.md']);
    });

    it('returns empty array for empty directory', () => {
      const files = loadDirectory(tmpDir);
      expect(files).toEqual([]);
    });
  });
});
