import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '../../common/auth/jwt-payload';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Require } from '../../common/decorators/require.decorator';
import {
  ArchiveResidentDto,
  CreateResidentDto,
  UpdateDnrDto,
  UpdateResidentAdminDto,
  UpdateResidentClinicalDto,
} from './dto/resident.dto';
import { ResidentsService } from './residents.service';

@ApiTags('residents')
@ApiBearerAuth()
@Controller('residents')
export class ResidentsController {
  constructor(private readonly residents: ResidentsService) {}

  @Get()
  @Require('resident.read')
  @ApiOperation({ summary: 'Lista de residentes — workers veem só os seus pisos (server-side)' })
  @ApiQuery({ name: 'floor', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['estavel', 'atencao', 'critico', 'recuperacao'],
  })
  @ApiQuery({ name: 'include_archived', required: false, type: Boolean, description: 'Só admin' })
  @ApiQuery({
    name: 'updated_since',
    required: false,
    type: String,
    format: 'date-time',
    description: 'ISO 8601 — delta fetch: só residentes alterados desde o cursor (offline cache)',
  })
  @ApiResponse({ status: 200 })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('floor') floor?: string,
    @Query('status') status?: 'estavel' | 'atencao' | 'critico' | 'recuperacao',
    @Query('include_archived') includeArchived?: string,
    @Query('updated_since') updatedSince?: string,
  ) {
    let updated_since: Date | undefined;
    if (updatedSince !== undefined) {
      updated_since = new Date(updatedSince);
      if (Number.isNaN(updated_since.getTime())) {
        throw new BadRequestException('updated_since deve ser uma data ISO 8601 válida');
      }
    }
    return this.residents.list(user, {
      floor: floor !== undefined ? Number(floor) : undefined,
      status,
      include_archived: includeArchived === 'true',
      updated_since,
    });
  }

  @Get(':id')
  @Require('resident.read')
  @ApiOperation({ summary: 'Detalhe do residente (404 fora dos pisos do worker)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  getById(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.residents.getById(user, id);
  }

  @Post()
  @Require('resident.create')
  @ApiOperation({ summary: 'Criar residente (admin)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 409, description: 'Número SNS duplicado neste Lar' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateResidentDto) {
    return this.residents.create(user, dto);
  }

  @Patch(':id')
  @Require('resident.update_admin')
  @ApiOperation({ summary: 'Editar dados administrativos — SNS, NIF, quarto, contactos (admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  updateAdmin(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResidentAdminDto,
  ) {
    return this.residents.updateAdmin(user, id, dto);
  }

  @Patch(':id/clinical')
  @Require('resident.update_clinical')
  @ApiOperation({
    summary: 'Editar dados clínicos — alergias, condições, estado (admin/nurse/doctor)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  updateClinical(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResidentClinicalDto,
  ) {
    return this.residents.updateClinical(user, id, dto);
  }

  @Patch(':id/dnr')
  @Require('resident.update_dnr')
  @ApiOperation({ summary: 'Editar diretiva DNR (admin/doctor)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  updateDnr(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDnrDto,
  ) {
    return this.residents.updateDnr(user, id, dto);
  }

  @Post(':id/archive')
  @Require('resident.archive')
  @ApiOperation({ summary: 'Arquivar residente (óbito/alta/transferência) — soft-delete, admin' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 409, description: 'Já arquivado' })
  archive(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArchiveResidentDto,
  ) {
    return this.residents.archive(user, id, dto);
  }
}
