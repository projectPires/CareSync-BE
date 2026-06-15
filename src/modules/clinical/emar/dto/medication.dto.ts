import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const FORMS = ['comp', 'cap', 'drop', 'patch', 'inj', 'suspension'] as const;
const ROUTES = ['oral', 'sublingual', 'im', 'sc', 'iv', 'topical'] as const;

/** Plan schedule (jsonb). v1: fixed daily clock times in the Lar timezone. */
export class MedicationScheduleDto {
  @ApiPropertyOptional({
    type: [String],
    example: ['08:00', '20:00'],
    description: 'Horas HH:MM (24h), fuso do Lar. Vazio = SOS/PRN (sem materialização).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { each: true, message: 'cada hora deve ser HH:MM (24h)' })
  times?: string[];

  @ApiPropertyOptional({
    type: [Number],
    example: [1, 2, 3, 4, 5],
    description: 'Dias da semana ISO 1=Seg..7=Dom. Omitido = todos os dias.',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  daysOfWeek?: number[];
}

export class CreateMedicationDto {
  @ApiProperty({ example: 'Lisinopril' })
  @IsString()
  @Length(1, 200)
  drug: string;

  @ApiPropertyOptional({ description: 'Denominação Comum Internacional', example: 'lisinopril' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  dci?: string;

  @ApiProperty({ example: '10 mg' })
  @IsString()
  @Length(1, 100)
  dose: string;

  @ApiProperty({ enum: FORMS })
  @IsEnum(FORMS)
  form: (typeof FORMS)[number];

  @ApiProperty({ enum: ROUTES })
  @IsEnum(ROUTES)
  route: (typeof ROUTES)[number];

  @ApiProperty({ type: MedicationScheduleDto })
  @ValidateNested()
  @Type(() => MedicationScheduleDto)
  schedule: MedicationScheduleDto;

  @ApiPropertyOptional({ example: 'Em jejum' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  condition?: string;

  @ApiPropertyOptional({ description: 'Médico prescritor (default: utilizador atual)' })
  @IsOptional()
  @IsUUID()
  prescribed_by?: string;

  @ApiProperty({ example: '2026-06-15' })
  @IsDateString()
  start_date: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Omitido = crónico' })
  @IsOptional()
  @IsDateString()
  end_date?: string;
}

/** Edição do plano (mutável — admin/doctor). */
export class UpdateMedicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  drug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  dci?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  dose?: string;

  @ApiPropertyOptional({ enum: FORMS })
  @IsOptional()
  @IsEnum(FORMS)
  form?: (typeof FORMS)[number];

  @ApiPropertyOptional({ enum: ROUTES })
  @IsOptional()
  @IsEnum(ROUTES)
  route?: (typeof ROUTES)[number];

  @ApiPropertyOptional({ type: MedicationScheduleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MedicationScheduleDto)
  schedule?: MedicationScheduleDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  condition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  end_date?: string;
}

/** Descontinuar plano (soft — define end_date; nunca DELETE físico de dados clínicos). */
export class DiscontinueMedicationDto {
  @ApiPropertyOptional({ description: 'Motivo da descontinuação (audit)' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}
