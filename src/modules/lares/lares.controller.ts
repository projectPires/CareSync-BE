import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '../../common/auth/jwt-payload';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Require } from '../../common/decorators/require.decorator';
import { UpdateLarDto } from './dto/lar.dto';
import { LaresService } from './lares.service';

@ApiTags('lar')
@ApiBearerAuth()
@Controller('lar')
export class LaresController {
  constructor(private readonly lares: LaresService) {}

  @Get()
  @Require('lar.read')
  @ApiOperation({ summary: 'Dados do próprio Lar (admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Sem permissão lar.read' })
  getOwn(@CurrentUser() user: JwtPayload) {
    return this.lares.getOwn(user);
  }

  @Patch()
  @Require('lar.update')
  @ApiOperation({ summary: 'Atualizar dados administrativos do Lar (admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  updateOwn(@CurrentUser() user: JwtPayload, @Body() dto: UpdateLarDto) {
    return this.lares.updateOwn(user, dto);
  }
}
