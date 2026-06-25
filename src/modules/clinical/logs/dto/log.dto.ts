import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

const CATEGORIES = ['medical', 'nutrition', 'hygiene', 'social'] as const;

export class CreateLogDto {
  @ApiProperty({ enum: CATEGORIES })
  @IsEnum(CATEGORIES)
  category: (typeof CATEGORIES)[number];

  @ApiProperty({ description: 'Tipo dentro da categoria (ver LOG_KINDS) — validado por categoria' })
  @IsString()
  @Length(1, 50)
  kind: string;

  @ApiProperty({ description: 'Ação/título do registo (obrigatório)' })
  @IsString()
  @Length(1, 200)
  title: string;

  @ApiPropertyOptional({
    description: 'Resultado/quantidade; em refeição/lanche = ingestão % (0–100)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Marca o registo para destaque no Resumo de Turno' })
  @IsOptional()
  @IsBoolean()
  flagged?: boolean;

  @ApiPropertyOptional({ description: 'UUID gerado no dispositivo — idempotência do sync offline' })
  @IsOptional()
  @IsUUID()
  client_id?: string;

  @ApiPropertyOptional({ description: 'Correção: id do registo a substituir (append-only)' })
  @IsOptional()
  @IsUUID()
  supersedes_id?: string;

  @ApiPropertyOptional({ description: 'Motivo da correção — obrigatório se supersedes_id (422)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Response shape (matches toLogResponse) — typed for the mobile codegen. */
export class LogResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() lar_id: string;
  @ApiProperty() resident_id: string;
  @ApiProperty({ enum: CATEGORIES }) category: (typeof CATEGORIES)[number];
  @ApiProperty() kind: string;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) value: string | null;
  @ApiProperty({ nullable: true, type: String }) notes: string | null;
  @ApiProperty() author_id: string;
  @ApiProperty() flagged: boolean;
  @ApiProperty({ nullable: true, type: String }) supersedes_id: string | null;
  @ApiProperty({ nullable: true, type: String }) reason: string | null;
  @ApiProperty() created_at: Date;
}
