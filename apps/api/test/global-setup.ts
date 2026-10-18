import { execSync } from 'node:child_process';

/**
 * Applies migrations to a dedicated *_test database (Prisma creates it if missing). Non-destructive: tests create
 * their own users, so leftover rows from earlier runs never interfere. CI starts from an empty database.
 */
export default async function () {
  const url = process.env.TEST_DATABASE_URL || 'postgresql://icc:icc@localhost:5434/icc_test';
  if (!/_test(\?|$)/.test(url)) throw new Error('TEST_DATABASE_URL must point at a *_test database');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
