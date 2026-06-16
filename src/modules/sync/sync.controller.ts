import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '../../common/auth/jwt-payload';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipRateLimit } from '../../common/decorators/skip-rate-limit.decorator';
import { SyncBatchDto } from './dto/sync.dto';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('batch')
  @SkipRateLimit()
  @ApiOperation({
    summary:
      'Ingestão da fila de mutações offline. Idempotente (replay = no-op), ' +
      'isolamento por item, autorização por item. Isento do rate limit por-utilizador.',
  })
  @ApiResponse({
    status: 201,
    description: 'Estado por item: applied / duplicate / conflict / error',
  })
  @ApiResponse({ status: 400, description: 'Payload inválido (mutations vazio/malformado)' })
  batch(@CurrentUser() user: JwtPayload, @Body() dto: SyncBatchDto) {
    return this.sync.batch(user, dto.mutations).then((results) => ({ results }));
  }
}
