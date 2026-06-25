import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const WOUND_STATUSES = ['open', 'healing', 'closed'] as const;

export class CreateWoundDto {
  @ApiProperty({
    description: 'Zona do body map (cabeca, sacro, calcanhar_e, …) — validado no serviço',
  })
  @IsString()
  location: string;

  @ApiPropertyOptional({ description: 'Tipo de ferida (UPP, cirúrgica, …)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  kind?: string;

  @ApiProperty({ description: 'Grau UPP 1–4 (≥3 exige wound.stage_severe)' })
  @IsInt()
  grade: number;
}

export class CreateWoundEvolutionDto {
  @ApiProperty({ description: 'Grau UPP 0–4 (0 = cicatrizada; ≥3 exige wound.stage_severe)' })
  @IsInt()
  grade: number;

  @ApiPropertyOptional({ description: 'Tamanho, ex: "3x2 cm"' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  size?: string;

  @ApiPropertyOptional({
    description: 'Penso: hidrocoloide/alginato/hidrogel/filme/espuma — validado no serviço',
  })
  @IsOptional()
  @IsString()
  dressing?: string;

  @ApiPropertyOptional({ description: 'Chave S3 tenant-scoped da foto (presign no #13)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photo_key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ enum: WOUND_STATUSES, description: 'Atualiza o status da ferida' })
  @IsOptional()
  @IsEnum(WOUND_STATUSES)
  status?: (typeof WOUND_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Correção: id da evolução a substituir (append-only)' })
  @IsOptional()
  @IsUUID()
  supersedes_id?: string;

  @ApiPropertyOptional({ description: 'Motivo da correção — obrigatório se supersedes_id (422)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ description: 'UUID do dispositivo — idempotência do sync offline' })
  @IsOptional()
  @IsUUID()
  client_id?: string;
}

export class WoundResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() lar_id: string;
  @ApiProperty() resident_id: string;
  @ApiProperty() location: string;
  @ApiProperty({ nullable: true, type: String }) kind: string | null;
  @ApiProperty({ nullable: true, type: Number }) grade: number | null;
  @ApiProperty({ enum: WOUND_STATUSES }) status: (typeof WOUND_STATUSES)[number];
  @ApiProperty() created_by: string;
  @ApiProperty() created_at: Date;
}

export class WoundEvolutionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() lar_id: string;
  @ApiProperty() wound_id: string;
  @ApiProperty() grade: number;
  @ApiProperty({ nullable: true, type: String }) size: string | null;
  @ApiProperty({ nullable: true, type: String }) dressing: string | null;
  @ApiProperty({ nullable: true, type: String }) trend: string | null;
  @ApiProperty({ nullable: true, type: String }) photo_key: string | null;
  @ApiProperty({ nullable: true, type: String }) notes: string | null;
  @ApiProperty() recorded_by: string;
  @ApiProperty({ nullable: true, type: String }) supersedes_id: string | null;
  @ApiProperty({ nullable: true, type: String }) reason: string | null;
  @ApiProperty() created_at: Date;
}
