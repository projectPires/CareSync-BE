import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '../../../common/auth/jwt-payload';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Require } from '../../../common/decorators/require.decorator';
import { CreateVitalDto } from './dto/vital.dto';
import { VitalsService } from './vitals.service';

@ApiTags('vitals')
@ApiBearerAuth()
@Controller('residents/:residentId/vitals')
export class VitalsController {
  constructor(private readonly vitals: VitalsService) {}

  @Post()
  @Require('vitals.record_basic')
  @ApiOperation({
    summary:
      'Registar sinal vital. SpO₂/Glicemia/Dor exigem vitals.record_advanced (🔒 delegável a aide). abnormal calculado no servidor.',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403, description: 'Métrica avançada sem permissão delegada' })
  @ApiResponse({ status: 404, description: 'Residente fora do âmbito' })
  @ApiResponse({ status: 422, description: 'Valor inválido para a métrica / correção sem reason' })
  create(
    @CurrentUser() user: JwtPayload,
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Body() dto: CreateVitalDto,
  ) {
    return this.vitals.create(user, residentId, dto);
  }

  @Get()
  @Require('vitals.read')
  @ApiOperation({
    summary: 'Histórico de sinais vitais (estado atual). Auxiliar limitado a 24h (server-side).',
  })
  @ApiQuery({
    name: 'metric',
    required: false,
    enum: ['bp', 'hr', 'spo2', 'temp', 'glucose', 'pain'],
  })
  @ApiQuery({ name: 'from', required: false, description: 'ISO 8601 (default: -7 dias)' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO 8601 (default: agora)' })
  @ApiResponse({ status: 200 })
  history(
    @CurrentUser() user: JwtPayload,
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Query('metric') metric?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.vitals.history(user, residentId, { metric, from, to });
  }
}
