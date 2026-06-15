import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { EmarService } from '../../clinical/emar/emar.service';
import { EMAR_TRANSITION_QUEUE, MISSED_AFTER_MS, TransitionJobData } from './emar.queues';

/**
 * Applies an automatic lifecycle transition. EmarService.transition locks the
 * current row FOR UPDATE and no-ops if the slot already moved on, so a job that
 * fires after a worker confirmed is a safe skip. On a successful delayed
 * transition, chains the +24 h missed job (jobId keyed on the administration so
 * a retry never double-enqueues).
 */
@Processor(EMAR_TRANSITION_QUEUE)
export class EmarTransitionProcessor extends WorkerHost {
  constructor(
    private readonly emar: EmarService,
    @InjectQueue(EMAR_TRANSITION_QUEUE) private readonly transitions: Queue,
  ) {
    super();
  }

  async process(job: Job<TransitionJobData>): Promise<void> {
    const { larId, administrationId, to } = job.data;
    const applied = await this.emar.transition(larId, administrationId, to);
    if (applied && to === 'delayed') {
      await this.transitions.add(
        'missed',
        { larId, administrationId, to: 'missed' } satisfies TransitionJobData,
        {
          delay: MISSED_AFTER_MS,
          jobId: `missed:${administrationId}`,
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    }
  }
}
