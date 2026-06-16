import { Module } from '@nestjs/common';
import { ClinicalModule } from '../clinical/clinical.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

/**
 * Sync module (#7) — offline mutation queue ingestion. Imports ClinicalModule
 * and composes its EXPORTED EmarService / VitalsService (one-directional
 * sync → clinical; no deep-import of internals, folder rule 1).
 */
@Module({
  imports: [ClinicalModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
