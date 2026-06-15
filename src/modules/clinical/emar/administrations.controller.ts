import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '../../../common/auth/jwt-payload';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Require } from '../../../common/decorators/require.decorator';
import { ConfirmAdministrationDto, RefuseAdministrationDto } from './dto/administration.dto';
import { EmarService } from './emar.service';

@ApiTags('emar')
@ApiBearerAuth()
@Controller('administrations')
export class AdministrationsController {
  constructor(private readonly emar: EmarService) {}

  @Get()
  @Require('emar.read')
  @ApiOperation({
    summary: 'Administrações de um residente num dia (estado atual por toma). Auxiliar: só hoje.',
  })
  @ApiQuery({ name: 'resident_id', required: true })
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD (default hoje)' })
  @ApiResponse({ status: 200 })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('resident_id', ParseUUIDPipe) residentId: string,
    @Query('date') date?: string,
  ) {
    return this.emar.listAdministrations(user, residentId, date);
  }

  @Post(':id/confirm')
  @Require('emar.administer')
  @ApiOperation({
    summary: 'Confirmar administração → taken. Auxiliar requer emar.administer delegado (🔒).',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 409, description: 'Já confirmada — { confirmed_by, confirmed_at }' })
  confirm(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmAdministrationDto,
  ) {
    return this.emar.confirm(user, id, dto);
  }

  @Post(':id/refuse')
  @Require('emar.refuse')
  @ApiOperation({ summary: 'Registar recusa → refused. reason obrigatório (422 se vazio).' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 409, description: 'Transição inválida' })
  @ApiResponse({ status: 422, description: 'reason em falta/vazio' })
  refuse(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefuseAdministrationDto,
  ) {
    return this.emar.refuse(user, id, dto);
  }
}
