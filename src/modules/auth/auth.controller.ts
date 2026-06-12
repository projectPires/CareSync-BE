import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '../../common/auth/jwt-payload';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import {
  AcceptInviteDto,
  InviteDto,
  LoginDto,
  PinLoginDto,
  RefreshDto,
  ResendInviteDto,
  SetPinDto,
  TokenPairResponse,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login email + password → JWT 15 min + refresh 30 d' })
  @ApiResponse({ status: 200, type: TokenPairResponse })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas (uniforme, sem oracle)' })
  @ApiResponse({ status: 409, description: 'Email em vários Lares — repetir com lar_id' })
  @ApiResponse({ status: 423, description: 'Conta bloqueada (5 falhas / 5 min → 30 min)' })
  login(@Body() dto: LoginDto): Promise<TokenPairResponse> {
    return this.auth.login(dto);
  }

  @Public()
  @Post('pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login por PIN (4–6 dígitos) → JWT' })
  @ApiResponse({ status: 200, type: TokenPairResponse })
  @ApiResponse({ status: 401, description: 'PIN inválido ou não configurado' })
  @ApiResponse({ status: 423, description: 'Conta bloqueada' })
  pinLogin(@Body() dto: PinLoginDto): Promise<TokenPairResponse> {
    return this.auth.pinLogin(dto);
  }

  @Put('pin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Definir/alterar o próprio PIN (autenticado)' })
  @ApiResponse({ status: 200 })
  async setPin(@CurrentUser() user: JwtPayload, @Body() dto: SetPinDto): Promise<void> {
    await this.auth.setPin(user, dto.pin);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Roda o refresh token (reuse → família revogada)' })
  @ApiResponse({ status: 200, type: TokenPairResponse })
  @ApiResponse({ status: 401, description: 'Token inválido / expirado / reutilizado' })
  refresh(@Body() dto: RefreshDto): Promise<TokenPairResponse> {
    return this.auth.refresh(dto.refresh_token);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoga a família do refresh token apresentado' })
  @ApiResponse({ status: 204 })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refresh_token);
  }

  @Post('invite')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Convidar worker (admin) — email com link 24 h' })
  @ApiResponse({ status: 201, description: 'Em dev devolve accept_url (sem mailer ainda)' })
  @ApiResponse({ status: 403, description: 'Só admins convidam' })
  @ApiResponse({ status: 409, description: 'Email já existe neste Lar' })
  @ApiResponse({ status: 422, description: 'Cédula em falta para nurse/doctor' })
  invite(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InviteDto,
  ): Promise<{ accept_url?: string }> {
    // Authorization matrix chega com o PermissionsGuard (#4); até lá, regra mínima:
    if (user.role !== 'admin') throw new ForbiddenException('Só admins podem convidar');
    return this.auth.invite(user, dto);
  }

  @Public()
  @Post('invite/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aceitar convite: define password e ativa a conta' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: 'Convite inválido' })
  @ApiResponse({ status: 410, description: 'Convite expirado — usar /invite/resend' })
  async acceptInvite(@Body() dto: AcceptInviteDto): Promise<void> {
    await this.auth.acceptInvite(dto);
  }

  @Public()
  @Post('invite/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reemitir convite expirado (resposta uniforme, sem oracle)' })
  @ApiResponse({ status: 200 })
  resendInvite(@Body() dto: ResendInviteDto): Promise<{ accept_url?: string }> {
    return this.auth.resendInvite(dto.email);
  }
}
