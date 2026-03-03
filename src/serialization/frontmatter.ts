const DELIMITER = '---';

export interface FrontmatterDoc<T = Record<string, unknown>> {
  attributes: T;
  body: string;
}

export function parseFrontmatter<T = Record<string, unknown>>(raw: string): FrontmatterDoc<T> {
  const trimmed = raw.trim();
  if (!trimmed.startsWith(DELIMITER)) {
    return { attributes: {} as T, body: trimmed };
  }

  const endIndex = trimmed.indexOf(`\n${DELIMITER}`, DELIMITER.length);
  if (endIndex === -1) {
    return { attributes: {} as T, body: trimmed };
  }

  const yamlBlock = trimmed.slice(DELIMITER.length + 1, endIndex).trim();
  const body = trimmed.slice(endIndex + DELIMITER.length + 1).trim();
  const attributes = parseSimpleYaml(yamlBlock) as T;

  return { attributes, body };
}

export function serializeFrontmatter<T extends Record<string, unknown>>(doc: FrontmatterDoc<T>): string {
  const yaml = serializeSimpleYaml(doc.attributes);
  if (!yaml) return doc.body;
  return `${DELIMITER}\n${yaml}\n${DELIMITER}\n${doc.body}`;
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of yaml.split('\n')) {
    const trimLine = line.trim();
    if (!trimLine || trimLine.startsWith('#')) continue;

    const colonIdx = trimLine.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimLine.slice(0, colonIdx).trim();
    const rawVal = trimLine.slice(colonIdx + 1).trim();

    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      const inner = rawVal.slice(1, -1).trim();
      result[key] = inner ? inner.split(',').map(s => unquote(s.trim())) : [];
    } else if (rawVal === 'true') {
      result[key] = true;
    } else if (rawVal === 'false') {
      result[key] = false;
    } else if (rawVal === 'null' || rawVal === '') {
      result[key] = rawVal === '' ? undefined : null;
    } else if (/^-?\d+(\.\d+)?$/.test(rawVal)) {
      result[key] = Number(rawVal);
    } else {
      result[key] = unquote(rawVal);
    }
  }
  return result;
}

function serializeSimpleYaml(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      const items = value.map(v => (typeof v === 'string' && needsQuote(v) ? `"${v}"` : String(v)));
      lines.push(`${key}: [${items.join(', ')}]`);
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === 'string' && needsQuote(value)) {
      lines.push(`${key}: "${value}"`);
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  return lines.join('\n');
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function needsQuote(s: string): boolean {
  return s.includes(',') || s.includes(':') || s.includes('#') || s.includes('\n');
}
