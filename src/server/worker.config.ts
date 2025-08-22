import { Worker as BullWorker, Queue } from 'bullmq';
import { logger } from '../utils/logger';
import { CustomAdvancedOptions, WorkerConfig } from './types';


export const createTaskQueue = (config: WorkerConfig) => {
  const { queueName, redis } = config;
  
  const queue = new Queue(queueName, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    }
  });
  logger.info(`Created task queue ${queueName} with retry policy`);

  return queue;
};

export const createWorker = (
  config: WorkerConfig,
  handlers: {
    startContainer: (data: any) => Promise<string>;
    stopContainer: (containerId: string) => Promise<void>;
  }
) => {
  const { queueName, redis, concurrency = 5 } = config;

  const worker = new BullWorker(queueName, async (job: { name: string; data: any, attemptsMade: number }) => {
    try {
      logger.info(`Processing job ${job.name} (attempt ${job.attemptsMade + 1})`);
      
      switch (job.name) {
        case 'startContainer':
          return await handlers.startContainer(job.data);
        case 'stopContainer':
          if (!job.data.containerId) {
            throw new Error('Missing containerId in stopContainer job');
          }
          return await handlers.stopContainer(job.data.containerId);
      }
    } catch (error) {
      logger.error(`Job ${job.name} failed (attempt ${job.attemptsMade + 1})`, error);
      throw error;
    }
  }, {
    connection: redis,
    concurrency,
    settings: {
      maxStalledCount: 0 // Disable stalled check for now
    } as CustomAdvancedOptions
  });

  worker.on('completed', (job: { id?: string }) => {
    logger.info(`Job ${job.id} completed`);
  });

  worker.on('failed', (job: { id?: string } | undefined, err: Error) => {
    logger.error(`Job ${job?.id} failed`, err);
  });

  return worker as BullWorker;
};