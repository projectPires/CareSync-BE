import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  EMAR_MATERIALIZE_QUEUE,
  MATERIALIZE_EVERY_MS,
  MATERIALIZE_REPEAT_JOB,
} from './emar.queues';

/**
 * Registers the singleton repeatable job that materialises pending
 * administrations for every active Lar. Idempotent: a fixed jobId means
 * re-registering on each boot does not stack duplicate schedulers.
 * Disabled under NODE_ENV=test so e2e stays deterministic (tests drive the
 * service directly).
 */
@Injectable()
export class EmarSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmarSchedulerService.name);

  constructor(
    @InjectQueue(EMAR_MATERIALIZE_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    await this.queue.add(
      MATERIALIZE_REPEAT_JOB,
      {},
      {
        repeat: { every: MATERIALIZE_EVERY_MS },
        jobId: MATERIALIZE_REPEAT_JOB,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
    this.logger.log(`eMAR materialiser scheduled every ${MATERIALIZE_EVERY_MS / 60_000} min`);
  }
}
