/**
 * Tests for A2E workflow validation and JSON fixing.
 */

import { validateWorkflow, fixJsonl, normalizeResponse } from '../../src/a2e/validate.js';

describe('fixJsonl', () => {
  it('fixes unquoted keys', () => {
    const input = '{type:"operationUpdate",operationId:"fetch"}';
    const fixed = fixJsonl(input);
    expect(JSON.parse(fixed)).toEqual({ type: 'operationUpdate', operationId: 'fetch' });
  });

  it('fixes unquoted /workflow/ paths', () => {
    const input = '{"outputPath":/workflow/data}';
    const fixed = fixJsonl(input);
    expect(JSON.parse(fixed)).toEqual({ outputPath: '/workflow/data' });
  });

  it('fixes unquoted URLs', () => {
    const input = '{"url":https://api.example.com/users}';
    const fixed = fixJsonl(input);
    expect(JSON.parse(fixed)).toEqual({ url: 'https://api.example.com/users' });
  });

  it('fixes trailing commas', () => {
    const input = '{"a":1,"b":2,}';
    const fixed = fixJsonl(input);
    expect(JSON.parse(fixed)).toEqual({ a: 1, b: 2 });
  });

  it('leaves valid JSON unchanged', () => {
    const input = '{"type":"operationUpdate","operationId":"fetch"}';
    expect(fixJsonl(input)).toBe(input);
  });

  it('handles multiline JSONL', () => {
    const input = '{type:"a"}\n{type:"b"}';
    const fixed = fixJsonl(input);
    const lines = fixed.split('\n');
    expect(JSON.parse(lines[0])).toEqual({ type: 'a' });
    expect(JSON.parse(lines[1])).toEqual({ type: 'b' });
  });
});

describe('validateWorkflow', () => {
  it('validates a correct workflow', () => {
    const workflow = [
      '{"type":"operationUpdate","operationId":"fetch","operation":{"ApiCall":{"method":"GET","url":"https://api.example.com/users","outputPath":"/workflow/users"}}}',
      '{"type":"operationUpdate","operationId":"filter","operation":{"FilterData":{"inputPath":"/workflow/users","conditions":[{"field":"active","operator":"==","value":true}],"outputPath":"/workflow/active"}}}',
      '{"type":"beginExecution","executionId":"exec-1","operationOrder":["fetch","filter"]}',
    ].join('\n');

    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.messages).toHaveLength(3);
  });

  it('rejects empty workflow', () => {
    const result = validateWorkflow('');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('Empty workflow');
  });

  it('rejects invalid JSON', () => {
    const result = validateWorkflow('not json at all');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('Invalid JSON');
  });

  it('rejects missing type', () => {
    const result = validateWorkflow('{"operationId":"fetch"}');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('type');
  });

  it('rejects unknown type', () => {
    const result = validateWorkflow('{"type":"unknownType"}');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('Unknown message type');
  });

  it('rejects unknown primitive', () => {
    const workflow = [
      '{"type":"operationUpdate","operationId":"x","operation":{"FakeOp":{}}}',
      '{"type":"beginExecution","executionId":"e","operationOrder":["x"]}',
    ].join('\n');
    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Unknown primitive'))).toBe(true);
  });

  it('auto-synthesizes missing beginExecution', () => {
    const result = validateWorkflow('{"type":"operationUpdate","operationId":"x","operation":{"Wait":{"duration":1000}}}');
    expect(result.valid).toBe(true);
    expect(result.autoFixed).toBe(true);
    expect(result.messages).toHaveLength(2);
    const begin = result.messages[1] as Record<string, unknown>;
    expect(begin.type).toBe('beginExecution');
    expect(begin.operationOrder).toEqual(['x']);
  });

  it('rejects undefined operationIds in operationOrder', () => {
    const workflow = [
      '{"type":"operationUpdate","operationId":"fetch","operation":{"ApiCall":{"method":"GET","url":"https://a.com","outputPath":"/workflow/d"}}}',
      '{"type":"beginExecution","executionId":"e","operationOrder":["fetch","nonexistent"]}',
    ].join('\n');
    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('nonexistent'))).toBe(true);
  });

  it('rejects duplicate operationIds', () => {
    const workflow = [
      '{"type":"operationUpdate","operationId":"fetch","operation":{"Wait":{"duration":100}}}',
      '{"type":"operationUpdate","operationId":"fetch","operation":{"Wait":{"duration":200}}}',
      '{"type":"beginExecution","executionId":"e","operationOrder":["fetch"]}',
    ].join('\n');
    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Duplicate'))).toBe(true);
  });

  it('validates ApiCall fields', () => {
    const workflow = [
      '{"type":"operationUpdate","operationId":"x","operation":{"ApiCall":{"method":"INVALID","url":"","outputPath":"bad"}}}',
      '{"type":"beginExecution","executionId":"e","operationOrder":["x"]}',
    ].join('\n');
    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('method'))).toBe(true);
    expect(result.errors.some(e => e.message.includes('outputPath'))).toBe(true);
  });

  it('validates FilterData conditions', () => {
    const workflow = [
      '{"type":"operationUpdate","operationId":"x","operation":{"FilterData":{"inputPath":"/workflow/d","conditions":[],"outputPath":"/workflow/o"}}}',
      '{"type":"beginExecution","executionId":"e","operationOrder":["x"]}',
    ].join('\n');
    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('non-empty'))).toBe(true);
  });

  it('validates MergeData sources minimum', () => {
    const workflow = [
      '{"type":"operationUpdate","operationId":"x","operation":{"MergeData":{"sources":["/workflow/a"],"strategy":"concat","outputPath":"/workflow/o"}}}',
      '{"type":"beginExecution","executionId":"e","operationOrder":["x"]}',
    ].join('\n');
    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('at least 2'))).toBe(true);
  });

  it('validates Wait duration range', () => {
    const workflow = [
      '{"type":"operationUpdate","operationId":"x","operation":{"Wait":{"duration":999999}}}',
      '{"type":"beginExecution","executionId":"e","operationOrder":["x"]}',
    ].join('\n');
    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('600000'))).toBe(true);
  });

  it('fixes and validates unquoted LLM output', () => {
    // Real gpt-oss-20b output with unquoted keys
    const raw = [
      '{type:operationUpdate,operationId:fetchA,operation:{ApiCall:{method:GET,url:https://api-a.com/items,outputPath:/workflow/dataA}}}',
      '{type:operationUpdate,operationId:fetchB,operation:{ApiCall:{method:GET,url:https://api-b.com/items,outputPath:/workflow/dataB}}}',
      '{type:operationUpdate,operationId:merge,operation:{MergeData:{sources:[/workflow/dataA,/workflow/dataB],strategy:concat,outputPath:/workflow/merged}}}',
      '{type:beginExecution,executionId:exec-1,operationOrder:[fetchA,fetchB,merge]}',
    ].join('\n');

    const result = validateWorkflow(raw);
    // The fixer should handle the unquoted keys and paths
    expect(result.fixed).toContain('"type"');
    expect(result.fixed).toContain('"operationUpdate"');
  });

  it('returns fixed JSONL even when validation fails', () => {
    const result = validateWorkflow('{type:"operationUpdate"}');
    expect(result.fixed).toContain('"type"');
  });

  it('validates all 8 primitives', () => {
    const workflow = [
      '{"type":"operationUpdate","operationId":"a","operation":{"ApiCall":{"method":"GET","url":"https://a.com","outputPath":"/workflow/a"}}}',
      '{"type":"operationUpdate","operationId":"b","operation":{"FilterData":{"inputPath":"/workflow/a","conditions":[{"field":"x","operator":"==","value":1}],"outputPath":"/workflow/b"}}}',
      '{"type":"operationUpdate","operationId":"c","operation":{"TransformData":{"inputPath":"/workflow/b","transform":"sort","outputPath":"/workflow/c"}}}',
      '{"type":"operationUpdate","operationId":"d","operation":{"Conditional":{"condition":{"path":"/workflow/c","operator":"exists"},"ifTrue":["a"]}}}',
      '{"type":"operationUpdate","operationId":"e","operation":{"Loop":{"inputPath":"/workflow/a","operations":["b"]}}}',
      '{"type":"operationUpdate","operationId":"f","operation":{"StoreData":{"inputPath":"/workflow/c","storage":"file","key":"out.json"}}}',
      '{"type":"operationUpdate","operationId":"g","operation":{"Wait":{"duration":1000}}}',
      '{"type":"operationUpdate","operationId":"h","operation":{"MergeData":{"sources":["/workflow/a","/workflow/b"],"strategy":"union","outputPath":"/workflow/h"}}}',
      '{"type":"beginExecution","executionId":"e1","operationOrder":["a","b","c","d","e","f","g","h"]}',
    ].join('\n');

    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(true);
    expect(result.messages).toHaveLength(9);
  });
});

describe('normalizeResponse', () => {
  it('strips reasoning model <think> tags', () => {
    const input = '<think>Let me analyze this...\nOkay I need ApiCall</think>\n{"type":"operationUpdate","operationId":"x","operation":{"Wait":{"duration":100}}}';
    const result = normalizeResponse(input);
    expect(result).not.toContain('<think>');
    expect(result).toContain('"operationUpdate"');
  });

  it('extracts from markdown code blocks', () => {
    const input = 'Here is the workflow:\n```jsonl\n{"type":"operationUpdate","operationId":"x","operation":{"Wait":{"duration":100}}}\n```\nDone!';
    const result = normalizeResponse(input);
    expect(result).toContain('"operationUpdate"');
    expect(result).not.toContain('```');
    expect(result).not.toContain('Here is');
  });

  it('collapses pretty-printed JSON to single lines', () => {
    const input = `{
  "type": "operationUpdate",
  "operationId": "fetch",
  "operation": {
    "ApiCall": {
      "method": "GET",
      "url": "https://api.example.com/users",
      "outputPath": "/workflow/users"
    }
  }
}`;
    const result = normalizeResponse(input);
    const lines = result.split('\n').filter(l => l.trim());
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toHaveProperty('type', 'operationUpdate');
  });

  it('reorders beginExecution placed before operationUpdate', () => {
    const input = [
      '{"type":"beginExecution","executionId":"e1","operationOrder":["x"]}',
      '{"type":"operationUpdate","operationId":"x","operation":{"Wait":{"duration":100}}}',
    ].join('\n');
    const result = normalizeResponse(input);
    const lines = result.split('\n');
    expect(lines[0]).toContain('operationUpdate');
    expect(lines[1]).toContain('beginExecution');
  });
});

describe('fixJsonl - truncation repair', () => {
  it('closes truncated JSON with missing braces', () => {
    const truncated = '{"type":"operationUpdate","operationId":"fetch","operation":{"ApiCall":{"method":"GET","url":"https://api.example.com/users","outputPath":"/workflow/users"}}';
    const fixed = fixJsonl(truncated);
    expect(() => JSON.parse(fixed)).not.toThrow();
    const parsed = JSON.parse(fixed);
    expect(parsed.type).toBe('operationUpdate');
    expect(parsed.operation.ApiCall.method).toBe('GET');
  });

  it('closes deeply truncated JSON', () => {
    const truncated = '{"type":"operationUpdate","operationId":"x","operation":{"ApiCall":{"method":"POST","url":"https://a.com","body":{"name":"test"';
    const fixed = fixJsonl(truncated);
    expect(() => JSON.parse(fixed)).not.toThrow();
  });
});

describe('validateWorkflow - auto-fix integration', () => {
  it('validates pretty-printed JSON from small models', () => {
    const prettyPrint = `{
  "type": "operationUpdate",
  "operationId": "fetch",
  "operation": {
    "ApiCall": {
      "method": "GET",
      "url": "https://api.example.com/users",
      "outputPath": "/workflow/users"
    }
  }
}
{
  "type": "beginExecution",
  "executionId": "e1",
  "operationOrder": ["fetch"]
}`;
    const result = validateWorkflow(prettyPrint);
    expect(result.valid).toBe(true);
    expect(result.messages).toHaveLength(2);
  });

  it('validates workflow with <think> tags', () => {
    const withThinking = `<think>I need to make an API call first, then filter.</think>
{"type":"operationUpdate","operationId":"fetch","operation":{"ApiCall":{"method":"GET","url":"https://api.example.com/users","outputPath":"/workflow/users"}}}
{"type":"beginExecution","executionId":"e1","operationOrder":["fetch"]}`;
    const result = validateWorkflow(withThinking);
    expect(result.valid).toBe(true);
  });

  it('auto-fixes truncated JSON + missing beginExecution', () => {
    const truncated = '{"type":"operationUpdate","operationId":"fetch","operation":{"ApiCall":{"method":"GET","url":"https://api.example.com/users","outputPath":"/workflow/users"}}';
    const result = validateWorkflow(truncated);
    expect(result.valid).toBe(true);
    expect(result.autoFixed).toBe(true);
    expect(result.messages).toHaveLength(2);
  });
});
