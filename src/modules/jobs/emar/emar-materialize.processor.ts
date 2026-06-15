import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmarService } from '../../clinical/emar/emar.service';
import {
  DELAYED_AFTER_MS,
  EMAR_MATERIALIZE_QUEUE,
  EMAR_TRANSITION_QUEUE,
  TransitionJobData,
} from './emar.queues';

/**
 * Per tick: enumerate active Lares (system_active_lar_ids — SECURITY DEFINER,
 * the only cross-tenant read), materialise pending administrations for each,
 * and enqueue a delayed-transition job per newly created slot.
 */
@Processor(EMAR_MATERIALIZE_QUEUE)
export class EmarMaterializeProcessor extends WorkerHost {
  private readonly logger = new Logger(EmarMaterializeProcessor.name);

  constructor(
    private readonly emar: EmarService,
    private readonly prisma: PrismaService,
    @InjectQueue(EMAR_TRANSITION_QUEUE) private readonly transitions: Queue,
  ) {
    super();
  }

  async process(): Promise<void> {
    const lares = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT v AS id FROM system_active_lar_ids() AS v`;
    let total = 0;
    for (const { id: larId } of lares) {
      const created = await this.emar.materializePending(larId);
      total += created.length;
      for (const slot of created) {
        const delay = Math.max(0, slot.scheduledAt.getTime() + DELAYED_AFTER_MS - Date.now());
        await this.transitions.add(
          'delayed',
          { larId, administrationId: slot.id, to: 'delayed' } satisfies TransitionJobData,
          { delay, jobId: `delayed:${slot.id}`, removeOnComplete: true, removeOnFail: 100 },
        );
      }
    }
    if (total > 0) this.logger.log(`Materialised ${total} pending administration(s)`);
  }
}
