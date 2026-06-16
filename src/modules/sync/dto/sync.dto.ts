import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsObject,
  IsUUID,
  ValidateNested,
} from 'class-validator';

/** Offline mutation types supported in Sprint 1 (logs/elim/activity = Sprint 2). */
export const SYNC_MUTATION_TYPES = [
  'vital.create',
  'administration.confirm',
  'administration.refuse',
] as const;
export type SyncMutationType = (typeof SYNC_MUTATION_TYPES)[number];

/** Max mutations per batch — a 2h offline flush is well under this. */
export const SYNC_BATCH_MAX = 200;

export class SyncMutationDto {
  @ApiProperty({
    description: 'UUID gerado no dispositivo — chave de idempotência (dedup do replay)',
  })
  @IsUUID()
  client_id: string;

  @ApiProperty({ enum: SYNC_MUTATION_TYPES })
  @IsEnum(SYNC_MUTATION_TYPES)
  type: SyncMutationType;

  @ApiProperty({
    description:
      'Payload por tipo: vital.create={resident_id,metric,value,recorded_at?}; ' +
      'administration.confirm={administration_id,administered_at?,notes?}; ' +
      'administration.refuse={administration_id,reason,notes?}. Validado no serviço-alvo.',
  })
  @IsObject()
  payload: Record<string, unknown>;
}

export class SyncBatchDto {
  @ApiProperty({
    type: [SyncMutationDto],
    description: 'Mutações ordenadas (processadas em ordem)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SYNC_BATCH_MAX)
  @ValidateNested({ each: true })
  @Type(() => SyncMutationDto)
  mutations: SyncMutationDto[];
}
