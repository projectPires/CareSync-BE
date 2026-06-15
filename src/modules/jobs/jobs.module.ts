import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClinicalModule } from '../clinical/clinical.module';
import { bullConnection } from './bull-connection';
import { EMAR_MATERIALIZE_QUEUE, EMAR_TRANSITION_QUEUE } from './emar/emar.queues';
import { EmarMaterializeProcessor } from './emar/emar-materialize.processor';
import { EmarSchedulerService } from './emar/emar-scheduler.service';
import { EmarTransitionProcessor } from './emar/emar-transition.processor';

/**
 * Jobs module — BullMQ queues + processors (medication scheduler #6; alerts,
 * push, exports, retention in later sprints). Imports ClinicalModule to drive
 * EmarService; never deep-imports its internals (folder rule 1). Dependency is
 * one-directional: jobs → clinical.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: bullConnection(config.getOrThrow<string>('REDIS_URL')),
      }),
    }),
    BullModule.registerQueue({ name: EMAR_MATERIALIZE_QUEUE }, { name: EMAR_TRANSITION_QUEUE }),
    ClinicalModule,
  ],
  providers: [EmarSchedulerService, EmarMaterializeProcessor, EmarTransitionProcessor],
})
export class JobsModule {}
