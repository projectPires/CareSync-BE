import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

/** Confirmar administração → taken. */
export class ConfirmAdministrationDto {
  @ApiPropertyOptional({ description: 'Nota opcional da administração' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  notes?: string;
}

/**
 * Registar recusa → refused. `reason` é OBRIGATÓRIO e não-vazio (clinical hard
 * rule 4). A não-vazidade é validada NO SERVIÇO → 422 (UnprocessableEntity), e
 * não pelo ValidationPipe (que devolveria 400) — o contrato pede 422.
 */
export class RefuseAdministrationDto {
  @ApiProperty({
    description: 'Motivo da recusa — obrigatório (validado no serviço → 422 se vazio)',
    required: true,
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
}
