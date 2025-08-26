import { Worker as BullWorker, Queue } from "bullmq";
import { logger } from "../utils/logger";
import { WorkerConfig } from "./types";

export const createTaskQueue = (config: WorkerConfig) => {
  // Redis/BullMQ removed from extension - function disabled
  logger.info("createTaskQueue disabled - Redis/BullMQ removed");
  return null as any;
};

export const createWorker = (
  config: WorkerConfig,
  handlers: {
    startContainer: (data: any) => Promise<string>;
    stopContainer: (containerId: string) => Promise<void>;
  },
) => {
  // Redis/BullMQ removed from extension - function disabled
  logger.info("createWorker disabled - Redis/BullMQ removed");
  return null as any;
};
