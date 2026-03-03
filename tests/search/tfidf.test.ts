import { describe, it, expect } from 'vitest';
import { TfIdfIndex } from '../../src/search/tfidf.js';

describe('TfIdfIndex', () => {
  it('adds and searches documents', () => {
    const index = new TfIdfIndex();
    index.addDocument('doc1', 'TypeScript strict mode configuration');
    index.addDocument('doc2', 'Python data analysis with pandas');
    index.addDocument('doc3', 'TypeScript React component patterns');

    const results = index.search('TypeScript');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toMatch(/doc[13]/);
  });

  it('removes documents', () => {
    const index = new TfIdfIndex();
    index.addDocument('doc1', 'hello world');
    expect(index.size).toBe(1);
    index.removeDocument('doc1');
    expect(index.size).toBe(0);
    expect(index.search('hello')).toEqual([]);
  });

  it('serializes and deserializes', () => {
    const index = new TfIdfIndex();
    index.addDocument('doc1', 'TypeScript strict mode');
    index.addDocument('doc2', 'Python analysis');

    const serialized = index.serialize();
    const restored = TfIdfIndex.deserialize(serialized);

    const origResults = index.search('TypeScript');
    const restoredResults = restored.search('TypeScript');
    expect(restoredResults.length).toBe(origResults.length);
    expect(restoredResults[0].id).toBe(origResults[0].id);
  });

  it('handles empty search', () => {
    const index = new TfIdfIndex();
    expect(index.search('anything')).toEqual([]);
  });

  it('handles deduplication on re-add', () => {
    const index = new TfIdfIndex();
    index.addDocument('doc1', 'hello world');
    index.addDocument('doc1', 'goodbye world');
    expect(index.size).toBe(1);
    const results = index.search('goodbye');
    expect(results.length).toBe(1);
  });
});
