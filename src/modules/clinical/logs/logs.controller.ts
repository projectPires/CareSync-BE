import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '../../../common/auth/jwt-payload';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Require } from '../../../common/decorators/require.decorator';
import { CreateLogDto, LogResponseDto } from './dto/log.dto';
import { LogsService } from './logs.service';

@ApiTags('logs')
@ApiBearerAuth()
@Controller('residents/:residentId/logs')
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Post()
  @Require('log.write')
  @ApiOperation({
    summary:
      'Registar log (medical/nutrition/hygiene/social). Autoridade de escrita por categoria (matriz §8): médico read-only nos cuidados — refinado no serviço. Append-only: correção = novo registo + supersedes_id + reason.',
  })
  @ApiResponse({ status: 201, type: LogResponseDto })
  @ApiResponse({ status: 401, description: 'Token ausente ou expirado' })
  @ApiResponse({ status: 403, description: 'Categoria sem permissão de escrita para o role' })
  @ApiResponse({
    status: 404,
    description: 'Residente fora do âmbito / registo a corrigir inexistente',
  })
  @ApiResponse({
    status: 422,
    description: 'kind/value inválido para a categoria, ou correção sem reason',
  })
  create(
    @CurrentUser() user: JwtPayload,
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Body() dto: CreateLogDto,
  ) {
    return this.logs.create(user, residentId, dto);
  }

  @Get()
  @Require('log.read')
  @ApiOperation({
    summary:
      'Lista de registos do residente (estado atual — correções colapsadas). Filtros: category/kind/flagged/from/to.',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ['medical', 'nutrition', 'hygiene', 'social'],
  })
  @ApiQuery({ name: 'kind', required: false })
  @ApiQuery({ name: 'flagged', required: false, description: 'true | false' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO 8601 (default: -7 dias)' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO 8601 (default: agora)' })
  @ApiResponse({ status: 200, type: LogResponseDto, isArray: true })
  @ApiResponse({ status: 401, description: 'Token ausente ou expirado' })
  list(
    @CurrentUser() user: JwtPayload,
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Query('category') category?: string,
    @Query('kind') kind?: string,
    @Query('flagged') flagged?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.logs.list(user, residentId, { category, kind, flagged, from, to });
  }
}
