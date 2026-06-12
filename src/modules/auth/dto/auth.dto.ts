import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'helena@larbemestar.pt' })
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({
    description: 'Desambiguação quando o mesmo email existe em mais do que um Lar',
  })
  @IsOptional()
  @IsUUID()
  lar_id?: string;
}

export class PinLoginDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'PIN de 4–6 dígitos', example: '1234' })
  @Matches(/^\d{4,6}$/, { message: 'PIN deve ter 4 a 6 dígitos' })
  pin: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  lar_id?: string;
}

export class SetPinDto {
  @ApiProperty({ description: 'PIN de 4–6 dígitos' })
  @Matches(/^\d{4,6}$/, { message: 'PIN deve ter 4 a 6 dígitos' })
  pin: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token opaco recebido no login' })
  @IsString()
  @Length(20, 200)
  refresh_token: string;
}

export class InviteDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @Length(2, 120)
  name: string;

  @ApiProperty({ enum: ['nurse', 'aide', 'doctor'] })
  @IsEnum(['nurse', 'aide', 'doctor'])
  role: 'nurse' | 'aide' | 'doctor';

  @ApiProperty({ type: [Number], description: 'Pisos atribuídos' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  floors: number[];

  @ApiPropertyOptional({ description: 'Cédula profissional (obrigatória para nurse/doctor)' })
  @IsOptional()
  @IsString()
  licence_number?: string;
}

export class AcceptInviteDto {
  @ApiProperty({ description: 'Token do email de convite' })
  @IsString()
  @Length(20, 200)
  token: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;
}

export class ResendInviteDto {
  @ApiProperty()
  @IsEmail()
  email: string;
}

export class TokenPairResponse {
  @ApiProperty()
  access_token: string;

  @ApiProperty({ description: 'Opaco; rotativo — cada refresh devolve um novo' })
  refresh_token: string;

  @ApiProperty({
    example: {
      id: 'uuid',
      lar_id: 'uuid',
      name: 'Sofia',
      role: 'nurse',
      floors: [2],
      extra_permissions: [],
    },
  })
  user: {
    id: string;
    lar_id: string;
    name: string;
    role: string;
    floors: number[];
    extra_permissions: string[];
  };
}
