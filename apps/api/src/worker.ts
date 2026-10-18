import './config';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { hostname } from 'node:os';
import { CoreModule } from './app.module';
import { assertConfig, config } from './config';
import { TickService } from './scheduler/tick.service';
import { QUEUE_NAME, redisConnection } from './tasks/queue.service';
import { TaskRunner } from './tasks/runner';

async function main() {
  assertConfig();
  const app = await NestFactory.createApplicationContext(CoreModule, { logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production', prefix: 'icc-worker' }) });
  app.enableShutdownHooks();
  const log = new Logger('Worker');
  const workerId = `${hostname()}:${process.pid}`;
  const runner = app.get(TaskRunner);
  const ticker = app.get(TickService);

  const worker = new Worker(QUEUE_NAME, async (job) => runner.run(job.data.taskId, workerId), { connection: redisConnection(), concurrency: config.workerConcurrency });
  worker.on('failed', (job, err) => log.error(`job ${job?.id} failed: ${err.message}`));
  worker.on('error', (err) => log.warn(`queue error (tick keeps working from the database): ${err.message}`));

  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      await ticker.tick(workerId);
    } catch (e) {
      log.error(`tick failed: ${(e as Error).message}`);
    } finally {
      ticking = false;
    }
  };
  await tick(); // recover immediately after a restart
  const timer = setInterval(tick, config.schedulerTickMs);
  log.log(`Worker ${workerId} running (concurrency ${config.workerConcurrency}, tick ${config.schedulerTickMs}ms)`);

  const stop = async () => {
    clearInterval(timer);
    await worker.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main();
