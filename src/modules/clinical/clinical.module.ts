import { Module } from '@nestjs/common';
import { AdministrationsController } from './emar/administrations.controller';
import { EmarService } from './emar/emar.service';
import { MedicationsController } from './emar/medications.controller';
import { VitalsController } from './vitals/vitals.controller';
import { VitalsService } from './vitals/vitals.service';

/**
 * Clinical module — eMAR (#6), vitals (#8), log entries, wounds, elimination,
 * activities. EmarService/VitalsService are exported so JobsModule (#6
 * scheduler) and the sync module (#7) can drive them WITHOUT deep-importing
 * internals (folder rule 1).
 */
@Module({
  controllers: [MedicationsController, AdministrationsController, VitalsController],
  providers: [EmarService, VitalsService],
  exports: [EmarService, VitalsService],
})
export class ClinicalModule {}
