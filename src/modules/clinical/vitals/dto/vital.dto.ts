import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const METRICS = ['bp', 'hr', 'spo2', 'temp', 'glucose', 'pain'] as const;

export class CreateVitalDto {
  @ApiProperty({ enum: METRICS })
  @IsEnum(METRICS)
  metric: (typeof METRICS)[number];

  @ApiProperty({
    description: 'Valor por métrica: bp = {sys,dia}; restantes = {value}. Validado por métrica.',
    example: { sys: 128, dia: 82 },
  })
  @IsObject()
  value: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Instante da medição (default: agora)' })
  @IsOptional()
  @IsDateString()
  recorded_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'UUID gerado no dispositivo — idempotência do sync offline' })
  @IsOptional()
  @IsUUID()
  client_id?: string;

  @ApiPropertyOptional({ description: 'Correção: id da leitura a substituir (append-only)' })
  @IsOptional()
  @IsUUID()
  supersedes_id?: string;

  @ApiPropertyOptional({
    description: 'Motivo da correção — obrigatório se supersedes_id (422 se vazio)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
