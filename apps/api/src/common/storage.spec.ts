import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// local-disk mode in a throwaway folder; config is read at import time, so set env first
const root = mkdtempSync(join(tmpdir(), 'icc-storage-'));
process.env.UPLOAD_DIR = root;
process.env.S3_ENDPOINT = '';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getFile, putFile, removeWorkspaceFiles, storageKey } = require('./storage') as typeof import('./storage');

it('accepts only workspaceId/file keys', () => {
  expect(storageKey('ws1/abc_D-9.pdf')).toBe('ws1/abc_D-9.pdf');
  expect(storageKey('/data/uploads/ws1/abc.pdf')).toBe('ws1/abc.pdf'); // older absolute rows: tail only
  expect(storageKey('../ws1/abc.pdf')).toBe('ws1/abc.pdf');
  expect(storageKey('ws1/../../etc')).toBeNull();
  expect(storageKey('WS/abc.pdf')).toBeNull();
  expect(storageKey('abc.pdf')).toBeNull();
});

it('stores, reads and deletes workspace files on disk', async () => {
  const key = await putFile('ws1', 'pdf', Buffer.from('%PDF-1.4'), 'application/pdf');
  expect(key).toMatch(/^ws1\/[\w-]+\.pdf$/);
  expect((await getFile(key))?.toString()).toBe('%PDF-1.4');
  expect(await getFile('ws1/missing.pdf')).toBeNull();
  expect(await getFile('../../etc/passwd')).toBeNull();
  await removeWorkspaceFiles('ws1');
  expect(existsSync(join(root, 'ws1'))).toBe(false);
  await expect(removeWorkspaceFiles('../x')).rejects.toThrow();
});
