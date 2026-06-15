import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '../../../common/auth/jwt-payload';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Require } from '../../../common/decorators/require.decorator';
import {
  CreateMedicationDto,
  DiscontinueMedicationDto,
  UpdateMedicationDto,
} from './dto/medication.dto';
import { EmarService } from './emar.service';

@ApiTags('emar')
@ApiBearerAuth()
@Controller('residents/:residentId/medications')
export class MedicationsController {
  constructor(private readonly emar: EmarService) {}

  @Post()
  @Require('emar.plan')
  @ApiOperation({ summary: 'Criar plano de medicação (admin/médico)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404, description: 'Residente fora do âmbito' })
  create(
    @CurrentUser() user: JwtPayload,
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Body() dto: CreateMedicationDto,
  ) {
    return this.emar.createPlan(user, residentId, dto);
  }

  @Get()
  @Require('emar.read')
  @ApiOperation({ summary: 'Listar planos de medicação do residente' })
  @ApiResponse({ status: 200 })
  list(@CurrentUser() user: JwtPayload, @Param('residentId', ParseUUIDPipe) residentId: string) {
    return this.emar.listPlans(user, residentId);
  }

  @Get(':id')
  @Require('emar.read')
  @ApiOperation({ summary: 'Detalhe de um plano' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  get(
    @CurrentUser() user: JwtPayload,
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.emar.getPlan(user, residentId, id);
  }

  @Patch(':id')
  @Require('emar.plan')
  @ApiOperation({ summary: 'Editar plano (admin/médico) — auditado before/after' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMedicationDto,
  ) {
    return this.emar.updatePlan(user, residentId, id, dto);
  }

  @Delete(':id')
  @Require('emar.plan')
  @ApiOperation({ summary: 'Descontinuar plano (soft — define end_date; sem DELETE físico)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  discontinue(
    @CurrentUser() user: JwtPayload,
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DiscontinueMedicationDto,
  ) {
    return this.emar.discontinuePlan(user, residentId, id, dto);
  }
}
