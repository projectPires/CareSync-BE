import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

/** Confirmar administração → taken. */
export class ConfirmAdministrationDto {
  @ApiPropertyOptional({ description: 'Nota opcional da administração' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  notes?: string;

  @ApiPropertyOptional({
    description: 'UUID gerado no dispositivo — idempotência do sync offline (replay = no-op)',
  })
  @IsOptional()
  @IsUUID()
  client_id?: string;

  @ApiPropertyOptional({
    description: 'Instante real da administração (offline pode ser anterior; default: agora)',
  })
  @IsOptional()
  @IsDateString()
  administered_at?: string;
}

/**
 * Registar recusa → refused. `reason` é OBRIGATÓRIO e não-vazio (clinical hard
 * rule 4). A não-vazidade é validada NO SERVIÇO → 422 (UnprocessableEntity), e
 * não pelo ValidationPipe (que devolveria 400) — o contrato pede 422.
 */
export class RefuseAdministrationDto {
  // @IsOptional no pipe (devolveria 400); a não-vazidade é validada no serviço → 422.
  @ApiPropertyOptional({
    description: 'Motivo da recusa — obrigatório de facto (vazio/ausente → 422 no serviço)',
    example: 'Residente recusou',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  notes?: string;

  @ApiPropertyOptional({ description: 'UUID gerado no dispositivo — idempotência do sync offline' })
  @IsOptional()
  @IsUUID()
  client_id?: string;
}
