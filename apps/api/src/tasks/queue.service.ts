import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { config } from '../config';

export const QUEUE_NAME = 'icc-tasks';

export function redisConnection() {
  const u = new URL(config.redisUrl);
  return { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined, db: Number(u.pathname.slice(1) || 0), maxRetriesPerRequest: null };
}

/**
 * Thin BullMQ wrapper. Redis only carries "run task X"; the task record in Postgres is the truth.
 * If Redis is down, enqueue fails softly and the scheduler tick picks the task up from the database.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private log = new Logger('Queue');
  private queue?: Queue;

  private get q() {
    this.queue ??= new Queue(QUEUE_NAME, { connection: redisConnection() });
    return this.queue;
  }

  async enqueue(taskId: string, attempt: number, delayMs = 0): Promise<boolean> {
    try {
      // jobId dedupes: the same task attempt is never queued twice.
      await this.q.add('run', { taskId }, { jobId: `${taskId}-${attempt}`, delay: delayMs, removeOnComplete: 1000, removeOnFail: 1000 });
      return true;
    } catch (e) {
      this.log.warn(`Enqueue failed for ${taskId} (tick will recover it): ${(e as Error).message}`);
      return false;
    }
  }

  async ping() {
    const c = await this.q.client;
    return (await (c as unknown as { ping(): Promise<string> }).ping()) === 'PONG';
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }
}
