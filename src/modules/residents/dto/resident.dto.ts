import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
} from 'class-validator';

const GENDERS = ['f', 'm', 'nb', 'not_disclosed'] as const;
const BLOOD_TYPES = [
  'a_pos',
  'a_neg',
  'b_pos',
  'b_neg',
  'ab_pos',
  'ab_neg',
  'o_pos',
  'o_neg',
  'unknown',
] as const;
const STATUSES = ['estavel', 'atencao', 'critico', 'recuperacao'] as const;
const ARCHIVE_REASONS = ['death', 'discharge', 'transfer', 'other'] as const;

export class CreateResidentDto {
  @ApiProperty({ example: 'Manuel Sousa' })
  @IsString()
  @Length(2, 120)
  name: string;

  @ApiProperty({ example: '1940-05-15' })
  @IsDateString()
  date_of_birth: string;

  @ApiProperty({ enum: GENDERS })
  @IsEnum(GENDERS)
  gender: (typeof GENDERS)[number];

  @ApiProperty({ description: 'Número SNS — único por Lar', example: '111222333' })
  @IsString()
  @Length(5, 20)
  sns_number: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nif?: string;

  @ApiProperty({ example: '101' })
  @IsString()
  room: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  floor: number;

  @ApiPropertyOptional({ enum: BLOOD_TYPES, default: 'unknown' })
  @IsOptional()
  @IsEnum(BLOOD_TYPES)
  blood_type?: (typeof BLOOD_TYPES)[number];

  @ApiPropertyOptional({ type: [String], example: ['Penicilina'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chronic_conditions?: string[];

  @ApiProperty({ example: '2026-01-10' })
  @IsDateString()
  admitted_at: string;

  @ApiProperty({ example: { name: 'Maria Sousa', relation: 'filha', phone: '+351 910 000 000' } })
  @IsObject()
  emergency_contact: Record<string, unknown>;

  @ApiPropertyOptional({
    example: { name: 'Dr. Luís', licence: '12345', phone: '+351 210 000 000' },
  })
  @IsOptional()
  @IsObject()
  assistant_doctor?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Consentimento RGPD assinado', default: false })
  @IsOptional()
  @IsBoolean()
  rgpd_consent?: boolean;

  @ApiPropertyOptional({ example: '2026-01-10' })
  @IsOptional()
  @IsDateString()
  rgpd_consent_at?: string;
}

/** Dados administrativos — matriz: só admin. */
export class UpdateResidentAdminDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(5, 20)
  sns_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nif?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  room?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  floor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  emergency_contact?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  assistant_doctor?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  rgpd_consent?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  rgpd_consent_at?: string;
}

/** Dados clínicos — matriz: admin, nurse, doctor. */
export class UpdateResidentClinicalDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chronic_conditions?: string[];

  @ApiPropertyOptional({ enum: BLOOD_TYPES })
  @IsOptional()
  @IsEnum(BLOOD_TYPES)
  blood_type?: (typeof BLOOD_TYPES)[number];

  @ApiPropertyOptional({ enum: STATUSES, description: 'Estado clínico' })
  @IsOptional()
  @IsEnum(STATUSES)
  status?: (typeof STATUSES)[number];
}

/** Diretiva DNR — matriz: admin, doctor. */
export class UpdateDnrDto {
  @ApiProperty({ description: 'Diretiva DNR ativa' })
  @IsBoolean()
  dnr: boolean;

  @ApiPropertyOptional({ description: 'PDF da diretiva assinada' })
  @IsOptional()
  @IsUrl()
  dnr_document_url?: string;
}

export class ArchiveResidentDto {
  @ApiProperty({ enum: ARCHIVE_REASONS })
  @IsEnum(ARCHIVE_REASONS)
  reason: (typeof ARCHIVE_REASONS)[number];
}
