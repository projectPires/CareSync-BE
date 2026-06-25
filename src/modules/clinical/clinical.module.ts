import { Module } from '@nestjs/common';
import { AdministrationsController } from './emar/administrations.controller';
import { EmarService } from './emar/emar.service';
import { MedicationsController } from './emar/medications.controller';
import { LogsController } from './logs/logs.controller';
import { LogsService } from './logs/logs.service';
import { ResidentScopeService } from './resident-scope.service';
import { VitalsController } from './vitals/vitals.controller';
import { VitalsService } from './vitals/vitals.service';

/**
 * Clinical module — eMAR (#6), vitals (#8), log entries (#10), wounds,
 * elimination, activities. EmarService/VitalsService are exported so JobsModule
 * (#6 scheduler) and the sync module (#7) can drive them WITHOUT deep-importing
 * internals (folder rule 1). ResidentScopeService is internal — the shared
 * server-side floor-scoping (clinical hard rule 7) every sub-service injects.
 */
@Module({
  controllers: [MedicationsController, AdministrationsController, VitalsController, LogsController],
  providers: [ResidentScopeService, EmarService, VitalsService, LogsService],
  exports: [EmarService, VitalsService, LogsService],
})
export class ClinicalModule {}
