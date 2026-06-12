import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '../../common/auth/jwt-payload';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Require } from '../../common/decorators/require.decorator';
import { UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Require('user.read')
  @ApiOperation({ summary: 'Lista de workers — admin vê tudo; workers projeção mínima' })
  @ApiResponse({ status: 200 })
  list(@CurrentUser() user: JwtPayload) {
    return this.users.list(user);
  }

  @Get(':id')
  @Require('user.read')
  @ApiOperation({ summary: 'Detalhe de worker (projeção conforme o role)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  getById(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.getById(user, id);
  }

  @Patch(':id')
  @Require('user.update')
  @ApiOperation({ summary: 'Editar role / pisos / cédula / nome (admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 422, description: 'Cédula em falta para nurse/doctor' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(user, id, dto);
  }

  @Post(':id/deactivate')
  @Require('user.deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desativar worker — revoga todas as sessões' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  async deactivate(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.users.setActive(user, id, false);
  }

  @Post(':id/reactivate')
  @Require('user.deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reativar worker desativado' })
  @ApiResponse({ status: 204 })
  async reactivate(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.users.setActive(user, id, true);
  }
}
