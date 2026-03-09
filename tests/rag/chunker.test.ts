import { describe, it, expect } from 'vitest';
import { chunkText, detectStrategy } from '../../src/rag/chunker.js';

describe('chunker', () => {
  // -----------------------------------------------------------------------
  // detectStrategy
  // -----------------------------------------------------------------------
  describe('detectStrategy', () => {
    it('returns markdown for .md files', () => {
      expect(detectStrategy('README.md')).toBe('markdown');
      expect(detectStrategy('/docs/guide.MD')).toBe('markdown');
    });

    it('returns paragraph for text/html/css', () => {
      expect(detectStrategy('notes.txt')).toBe('paragraph');
      expect(detectStrategy('page.html')).toBe('paragraph');
      expect(detectStrategy('style.css')).toBe('paragraph');
    });

    it('returns fixed for code files', () => {
      expect(detectStrategy('app.ts')).toBe('fixed');
      expect(detectStrategy('index.js')).toBe('fixed');
      expect(detectStrategy('main.py')).toBe('fixed');
      expect(detectStrategy('data.json')).toBe('fixed');
    });
  });

  // -----------------------------------------------------------------------
  // Empty input
  // -----------------------------------------------------------------------
  describe('empty input', () => {
    it('returns empty array for empty string', () => {
      expect(chunkText('', { strategy: 'fixed' })).toEqual([]);
      expect(chunkText('', { strategy: 'paragraph' })).toEqual([]);
      expect(chunkText('', { strategy: 'markdown' })).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------
  describe('validation', () => {
    it('throws if overlap >= chunkSize', () => {
      expect(() => chunkText('hello', { chunkSize: 100, overlap: 100 })).toThrow('Overlap must be less than chunkSize');
      expect(() => chunkText('hello', { chunkSize: 100, overlap: 200 })).toThrow('Overlap must be less than chunkSize');
    });
  });

  // -----------------------------------------------------------------------
  // Fixed strategy
  // -----------------------------------------------------------------------
  describe('fixed strategy', () => {
    it('creates chunks with correct size and overlap', () => {
      const text = 'a'.repeat(300);
      const chunks = chunkText(text, { strategy: 'fixed', chunkSize: 100, overlap: 20 });

      expect(chunks.length).toBe(4); // 300 chars, step=80, offsets: 0,80,160,240
      expect(chunks[0].text.length).toBe(100);
      expect(chunks[0].startOffset).toBe(0);
      expect(chunks[1].startOffset).toBe(80);
      expect(chunks[0].index).toBe(0);
      expect(chunks[1].index).toBe(1);
    });

    it('handles text smaller than chunkSize', () => {
      const chunks = chunkText('short text', { strategy: 'fixed', chunkSize: 1000, overlap: 0 });
      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe('short text');
    });

    it('each chunk has a unique hash', () => {
      const text = 'Alpha paragraph.\n\nBeta paragraph.\n\nGamma paragraph.';
      const chunks = chunkText(text, { strategy: 'fixed', chunkSize: 20, overlap: 0 });
      const hashes = chunks.map(c => c.hash);
      expect(new Set(hashes).size).toBe(hashes.length);
    });

    it('hash is SHA-256 hex', () => {
      const chunks = chunkText('hello world', { strategy: 'fixed', chunkSize: 1000, overlap: 0 });
      expect(chunks[0].hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // -----------------------------------------------------------------------
  // Paragraph strategy
  // -----------------------------------------------------------------------
  describe('paragraph strategy', () => {
    it('splits on double newlines', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const chunks = chunkText(text, { strategy: 'paragraph', chunkSize: 1000, overlap: 0 });
      expect(chunks.length).toBe(1); // All fits in one chunk
      expect(chunks[0].text).toContain('First paragraph.');
      expect(chunks[0].text).toContain('Third paragraph.');
    });

    it('creates multiple chunks when paragraphs exceed chunkSize', () => {
      const para1 = 'A'.repeat(60);
      const para2 = 'B'.repeat(60);
      const para3 = 'C'.repeat(60);
      const text = `${para1}\n\n${para2}\n\n${para3}`;
      const chunks = chunkText(text, { strategy: 'paragraph', chunkSize: 100, overlap: 0 });

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      // First chunk should contain para1
      expect(chunks[0].text).toContain(para1);
    });

    it('falls back to fixed for oversized paragraphs', () => {
      const bigPara = 'X'.repeat(500);
      const text = `Small intro.\n\n${bigPara}\n\nSmall outro.`;
      const chunks = chunkText(text, { strategy: 'paragraph', chunkSize: 100, overlap: 0 });

      expect(chunks.length).toBeGreaterThan(1);
    });

    it('applies overlap between chunks', () => {
      const para1 = 'A'.repeat(80);
      const para2 = 'B'.repeat(80);
      const text = `${para1}\n\n${para2}`;
      const chunks = chunkText(text, { strategy: 'paragraph', chunkSize: 100, overlap: 20 });

      expect(chunks.length).toBe(2);
      // Second chunk should start with overlap from first
      const overlap = chunks[1].text.slice(0, 20);
      expect(chunks[0].text).toContain(overlap);
    });

    it('filters out whitespace-only paragraphs', () => {
      const text = 'Hello.\n\n   \n\nWorld.';
      const chunks = chunkText(text, { strategy: 'paragraph', chunkSize: 1000, overlap: 0 });
      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe('Hello.\n\nWorld.');
    });
  });

  // -----------------------------------------------------------------------
  // Markdown strategy
  // -----------------------------------------------------------------------
  describe('markdown strategy', () => {
    it('splits on markdown headers', () => {
      const text = '# Title\n\nIntro paragraph.\n\n## Section A\n\nContent A.\n\n## Section B\n\nContent B.';
      const chunks = chunkText(text, { strategy: 'markdown', chunkSize: 50, overlap: 0 });

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      // First chunk should start with # Title
      expect(chunks[0].text).toMatch(/^# Title/);
    });

    it('keeps header with its content', () => {
      const text = '# Main\n\nSome content.\n\n## Sub\n\nMore content.';
      const chunks = chunkText(text, { strategy: 'markdown', chunkSize: 1000, overlap: 0 });

      // Everything fits in one chunk
      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toContain('# Main');
      expect(chunks[0].text).toContain('## Sub');
    });

    it('handles text without headers', () => {
      const text = 'Just a plain paragraph.\n\nAnother one.';
      const chunks = chunkText(text, { strategy: 'markdown', chunkSize: 1000, overlap: 0 });
      expect(chunks.length).toBe(1);
    });

    it('splits oversized sections with paragraph fallback', () => {
      const bigSection = '# Big\n\n' + 'Word '.repeat(200);
      const chunks = chunkText(bigSection, { strategy: 'markdown', chunkSize: 100, overlap: 0 });
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  // -----------------------------------------------------------------------
  // Default options
  // -----------------------------------------------------------------------
  describe('defaults', () => {
    it('uses paragraph strategy and chunkSize=1000 by default', () => {
      const text = 'A'.repeat(500) + '\n\n' + 'B'.repeat(500) + '\n\n' + 'C'.repeat(500);
      const chunks = chunkText(text);
      // With chunkSize=1000, overlap=200, paragraph strategy
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });
  });
});
