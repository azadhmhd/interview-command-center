/**
 * Dedicated, isolated browser profiles for job applications. Each profile name gets its own user-data dir under
 * ~/.icc-apply-runner/profiles (never your everyday Chrome profile), so cookies and sessions never mix between
 * users, runners or tasks. A lock file stops two runners from sharing one profile. Cookies, passwords and tokens are
 * never read or logged by the runner.
 */
import { chromium, type BrowserContext } from 'playwright';
import { closeSync, mkdirSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

export function profileDir(name: string, root = join(homedir(), '.icc-apply-runner', 'profiles')) {
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(name)) throw new Error('Profile name may only contain letters, digits, - and _');
  const dir = resolve(root, name);
  if (!dir.startsWith(resolve(root) + sep)) throw new Error('Invalid profile path');
  return dir;
}

export async function openProfile(name: string, opts: { headless: boolean; root?: string }): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
  const dir = profileDir(name, opts.root);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = join(dir, '.icc-runner.lock');
  let fd: number;
  try {
    fd = openSync(lock, 'wx');
  } catch {
    throw new Error(`Profile "${name}" is in use by another runner (remove ${lock} if no runner is running)`);
  }
  writeFileSync(fd, String(process.pid));
  closeSync(fd);
  const context = await chromium.launchPersistentContext(dir, { headless: opts.headless, viewport: { width: 1280, height: 900 } });
  return {
    context,
    close: async () => {
      await context.close().catch(() => undefined);
      rmSync(lock, { force: true });
    },
  };
}
