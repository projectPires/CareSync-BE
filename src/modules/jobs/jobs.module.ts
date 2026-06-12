import { Module } from '@nestjs/common';

/**
 * Jobs module — BullMQ queues and processors (medication scheduler, delayed/missed
 * transitions, alert rules, push delivery, exports, retention).
 * Implementation: issues #6, #17, #21, #22, #24, #26.
 */
@Module({})
export class JobsModule {}
