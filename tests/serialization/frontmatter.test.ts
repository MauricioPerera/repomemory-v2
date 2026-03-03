import { describe, it, expect } from 'vitest';
import { parseFrontmatter, serializeFrontmatter } from '../../src/serialization/frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses frontmatter with attributes and body', () => {
    const raw = `---
title: Hello
tags: [a, b, c]
count: 42
active: true
---
Body content here`;
    const doc = parseFrontmatter(raw);
    expect(doc.attributes).toEqual({
      title: 'Hello',
      tags: ['a', 'b', 'c'],
      count: 42,
      active: true,
    });
    expect(doc.body).toBe('Body content here');
  });

  it('returns body only when no frontmatter', () => {
    const doc = parseFrontmatter('Just plain text');
    expect(doc.attributes).toEqual({});
    expect(doc.body).toBe('Just plain text');
  });

  it('handles empty arrays', () => {
    const raw = `---
tags: []
---
Body`;
    const doc = parseFrontmatter(raw);
    expect(doc.attributes).toEqual({ tags: [] });
  });

  it('handles false and null values', () => {
    const raw = `---
enabled: false
value: null
---
Body`;
    const doc = parseFrontmatter(raw);
    expect(doc.attributes).toEqual({ enabled: false, value: null });
  });
});

describe('serializeFrontmatter', () => {
  it('round-trips', () => {
    const doc = {
      attributes: { title: 'Test', count: 5, tags: ['a', 'b'] },
      body: 'Content',
    };
    const serialized = serializeFrontmatter(doc);
    const parsed = parseFrontmatter(serialized);
    expect(parsed.attributes).toEqual(doc.attributes);
    expect(parsed.body).toBe(doc.body);
  });

  it('skips frontmatter when no attributes', () => {
    const result = serializeFrontmatter({ attributes: {}, body: 'Text' });
    expect(result).toBe('Text');
  });
});
