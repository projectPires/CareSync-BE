import { Module } from '@nestjs/common';
import { AdministrationsController } from './emar/administrations.controller';
import { EmarService } from './emar/emar.service';
import { MedicationsController } from './emar/medications.controller';

/**
 * Clinical module — eMAR (#6), vitals (#8), log entries, wounds, elimination,
 * activities. EmarService is exported so JobsModule (#6 scheduler) can drive
 * materialisation/transitions WITHOUT deep-importing internals (folder rule 1).
 */
@Module({
  controllers: [MedicationsController, AdministrationsController],
  providers: [EmarService],
  exports: [EmarService],
})
export class ClinicalModule {}
