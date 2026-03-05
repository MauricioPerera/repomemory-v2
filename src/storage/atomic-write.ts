import { writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';

export function atomicWriteFileSync(filePath: string, data: string): void {
  const dir = dirname(filePath);
  const tmp = join(dir, `.tmp-${randomBytes(6).toString('hex')}`);
  try {
    writeFileSync(tmp, data, 'utf8');
    renameSync(tmp, filePath);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* best effort */ }
    throw e;
  }
}
