import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional({ enum: ['nurse', 'aide', 'doctor'] })
  @IsOptional()
  @IsEnum(['nurse', 'aide', 'doctor'])
  role?: 'nurse' | 'aide' | 'doctor';

  @ApiPropertyOptional({ type: [Number], description: 'Pisos atribuídos' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  floors?: number[];

  @ApiPropertyOptional({ description: 'Cédula profissional (obrigatória para nurse/doctor)' })
  @IsOptional()
  @IsString()
  licence_number?: string;
}
