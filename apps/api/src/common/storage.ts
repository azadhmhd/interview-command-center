import {
  CreateBucketCommand, DeleteObjectsCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { config } from '../config';
import { newToken } from './crypto';
import { uploadPath } from './uploads';

/**
 * Stored files (CVs, generated resume PDFs, attachments). Keys are "workspaceId/file", the same value rows keep in
 * `storagePath`, so switching between MinIO (S3_ENDPOINT set) and the local upload folder needs no data migration.
 */
const s3 = config.s3.endpoint
  ? new S3Client({
      endpoint: config.s3.endpoint, region: config.s3.region, forcePathStyle: true,
      credentials: { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey },
    })
  : null;
const Bucket = config.s3.bucket;

/** Normalised "workspaceId/file" key, or null for anything that is not one. Older rows hold absolute paths: their tail is used. */
export function storageKey(stored: string): string | null {
  const key = stored.split(/[\\/]/).slice(-2).join('/');
  return /^[a-z0-9]+\/[\w-]+\.[a-z0-9]+$/.test(key) ? key : null;
}

export async function putFile(workspaceId: string, ext: string, body: Buffer, contentType: string): Promise<string> {
  const key = storageKey(`${workspaceId}/${newToken()}.${ext}`);
  if (!key) throw new Error('Invalid storage key');
  if (s3) await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
  else {
    const path = uploadPath(key)!;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body, { mode: 0o600 });
  }
  return key;
}

/** File contents, or null when the key is invalid or the file is gone. */
export async function getFile(stored: string): Promise<Buffer | null> {
  const key = storageKey(stored);
  if (!key) return null;
  try {
    if (s3) return Buffer.from(await (await s3.send(new GetObjectCommand({ Bucket, Key: key }))).Body!.transformToByteArray());
    return await readFile(uploadPath(key)!);
  } catch (e) {
    if ((e as { name?: string; code?: string }).name === 'NoSuchKey' || (e as { code?: string }).code === 'ENOENT') return null;
    throw e;
  }
}

/** Deletes every stored file of a workspace (account deletion). Local copies are removed too, if any are left. */
export async function removeWorkspaceFiles(workspaceId: string) {
  if (!/^[a-z0-9]+$/.test(workspaceId)) throw new Error('Invalid workspace id');
  await rm(join(config.uploadDir, workspaceId), { recursive: true, force: true });
  if (!s3) return;
  for (;;) {
    const page = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: `${workspaceId}/` }));
    const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (!keys.length) return;
    await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys } }));
  }
}

/**
 * Startup: create the bucket if missing and copy files saved in the local upload folder (before MinIO was enabled) into
 * it. Idempotent; local files are kept as a backup.
 */
export async function prepareStorage(log: (msg: string) => void = console.log) {
  if (!s3) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket }));
    log(`Created storage bucket "${Bucket}"`);
  }
  let copied = 0;
  for (const ws of await readdir(config.uploadDir).catch(() => [] as string[])) {
    for (const file of await readdir(join(config.uploadDir, ws)).catch(() => [] as string[])) {
      const key = storageKey(`${ws}/${file}`);
      if (!key) continue;
      try {
        await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
      } catch {
        await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: await readFile(uploadPath(key)!) }));
        copied++;
      }
    }
  }
  if (copied) log(`Copied ${copied} local upload(s) into storage bucket "${Bucket}"`);
}
