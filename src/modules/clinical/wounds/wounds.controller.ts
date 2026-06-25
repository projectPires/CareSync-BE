import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '../../../common/auth/jwt-payload';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Require } from '../../../common/decorators/require.decorator';
import {
  CreateWoundDto,
  CreateWoundEvolutionDto,
  WoundEvolutionResponseDto,
  WoundResponseDto,
} from './dto/wound.dto';
import { WoundsService } from './wounds.service';

@ApiTags('wounds')
@ApiBearerAuth()
@Controller('residents/:residentId/wounds')
export class WoundsController {
  constructor(private readonly wounds: WoundsService) {}

  @Post()
  @Require('wound.record')
  @ApiOperation({
    summary:
      'Criar ferida (UPP). Grau 1–4; grau ≥3 exige wound.stage_severe (enfermeiro+) — auxiliar delegado fica limitado a 1–2. Append-only nas evoluções.',
  })
  @ApiResponse({ status: 201, type: WoundResponseDto })
  @ApiResponse({ status: 401, description: 'Token ausente ou expirado' })
  @ApiResponse({
    status: 403,
    description: 'Sem permissão wound.record / grau ≥3 sem wound.stage_severe',
  })
  @ApiResponse({ status: 404, description: 'Residente fora do âmbito' })
  @ApiResponse({ status: 422, description: 'Zona/grau inválido' })
  createWound(
    @CurrentUser() user: JwtPayload,
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Body() dto: CreateWoundDto,
  ) {
    return this.wounds.createWound(user, residentId, dto);
  }

  @Get()
  @Require('wound.read')
  @ApiOperation({ summary: 'Listar feridas do residente (estado atual).' })
  @ApiResponse({ status: 200, type: WoundResponseDto, isArray: true })
  @ApiResponse({ status: 401, description: 'Token ausente ou expirado' })
  @ApiResponse({ status: 403, description: 'Sem permissão wound.read' })
  @ApiResponse({ status: 404, description: 'Residente fora do âmbito' })
  listWounds(
    @CurrentUser() user: JwtPayload,
    @Param('residentId', ParseUUIDPipe) residentId: string,
  ) {
    return this.wounds.listWounds(user, residentId);
  }

  @Post(':woundId/evolutions')
  @Require('wound.record')
  @ApiOperation({
    summary:
      'Registar evolução da ferida (append-only). Grau 0–4 (≥3 exige wound.stage_severe); subida de grau emite wound.deteriorated. Correção = nova evolução + supersedes_id + reason.',
  })
  @ApiResponse({ status: 201, type: WoundEvolutionResponseDto })
  @ApiResponse({ status: 401, description: 'Token ausente ou expirado' })
  @ApiResponse({ status: 403, description: 'Grau ≥3 sem wound.stage_severe' })
  @ApiResponse({
    status: 404,
    description: 'Residente/ferida fora do âmbito ou evolução a corrigir inexistente',
  })
  @ApiResponse({ status: 422, description: 'Grau/penso inválido ou correção sem reason' })
  addEvolution(
    @CurrentUser() user: JwtPayload,
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Param('woundId', ParseUUIDPipe) woundId: string,
    @Body() dto: CreateWoundEvolutionDto,
  ) {
    return this.wounds.addEvolution(user, residentId, woundId, dto);
  }

  @Get(':woundId/evolutions')
  @Require('wound.read')
  @ApiOperation({
    summary: 'Timeline de evoluções (estado atual, mais recente primeiro) com autor + timestamps.',
  })
  @ApiResponse({ status: 200, type: WoundEvolutionResponseDto, isArray: true })
  @ApiResponse({ status: 401, description: 'Token ausente ou expirado' })
  @ApiResponse({ status: 403, description: 'Sem permissão wound.read' })
  @ApiResponse({ status: 404, description: 'Residente/ferida fora do âmbito' })
  listEvolutions(
    @CurrentUser() user: JwtPayload,
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Param('woundId', ParseUUIDPipe) woundId: string,
  ) {
    return this.wounds.listEvolutions(user, residentId, woundId);
  }
}
