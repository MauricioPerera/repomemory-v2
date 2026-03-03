export function print(msg: string): void {
  process.stdout.write(msg + '\n');
}

export function printJson(data: unknown): void {
  print(JSON.stringify(data, null, 2));
}

export function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? '').length)),
  );

  const sep = widths.map(w => '-'.repeat(w)).join(' | ');
  const header = headers.map((h, i) => h.padEnd(widths[i])).join(' | ');

  print(header);
  print(sep);
  for (const row of rows) {
    print(row.map((c, i) => (c ?? '').padEnd(widths[i])).join(' | '));
  }
}

export function printError(msg: string): void {
  process.stderr.write(`Error: ${msg}\n`);
}
