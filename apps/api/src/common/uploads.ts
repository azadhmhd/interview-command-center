import { isAbsolute, resolve, sep } from 'node:path';
import { config } from '../config';

/**
 * Absolute path of a stored upload, or null if it would escape the upload folder. New rows store "workspaceId/file";
 * older rows hold an absolute path from whichever machine saved them (local dev vs Docker), so only their
 * "workspaceId/file" tail is used.
 */
export function uploadPath(stored: string): string | null {
  const root = resolve(config.uploadDir);
  const rel = isAbsolute(stored) ? stored.split(/[\\/]/).slice(-2).join(sep) : stored;
  const p = resolve(root, rel);
  return p.startsWith(root + sep) ? p : null;
}
