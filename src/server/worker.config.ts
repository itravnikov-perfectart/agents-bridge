import { Queue, Worker as BullWorker } from 'bullmq';
import { logger } from '../utils/logger';
import Docker from 'dockerode';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

export interface WorkerConfig {
  queueName: string;
  redis: RedisConfig;
  concurrency?: number;
}

export const createTaskQueue = (config: WorkerConfig) => {
  const { queueName, redis } = config;
  
  const queue = new Queue(queueName, { connection: redis });
  logger.info(`Created task queue ${queueName}`);

  return queue;
};

export const createWorker = (
  config: WorkerConfig,
  docker: Docker,
  handlers: {
    startContainer: (data: any) => Promise<string>;
    stopContainer: (containerId: string) => Promise<void>;
  }
) => {
  const { queueName, redis, concurrency = 5 } = config;

  const worker = new BullWorker(queueName, async (job: { name: string; data: any }) => {
    switch (job.name) {
      case 'startContainer':
        return handlers.startContainer(job.data);
      case 'stopContainer':
        if (!job.data.containerId) {
          throw new Error('Missing containerId in stopContainer job');
        }
        return handlers.stopContainer(job.data.containerId);
    }
  }, { 
    connection: redis,
    concurrency
  });

  worker.on('completed', (job: { id?: string }) => {
    logger.info(`Job ${job.id} completed`);
  });

  worker.on('failed', (job: { id?: string } | undefined, err: Error) => {
    logger.error(`Job ${job?.id} failed`, err);
  });

  return worker as BullWorker;
};