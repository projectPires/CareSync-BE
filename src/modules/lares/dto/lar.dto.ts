import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateLarDto {
  @ApiPropertyOptional({ example: 'Lar Bem-Estar' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 200)
  legal_name?: string;

  @ApiPropertyOptional({
    example: { street: 'Rua das Flores 12', postal: '1200-192', city: 'Lisboa' },
  })
  @IsOptional()
  @IsObject()
  address?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Número de pisos clínicos' })
  @IsOptional()
  @IsInt()
  @Min(1)
  floors?: number;

  @ApiPropertyOptional({ description: 'Capacidade total (camas)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ description: 'Rácios mínimos, horários de turnos padrão, etc.' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
