import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness + dependency checks (Postgres, Redis)' })
  @ApiResponse({ status: 200, description: 'All dependencies up' })
  @ApiResponse({ status: 503, description: 'One or more dependencies down' })
  async check(@Res() res: Response): Promise<void> {
    const report = await this.health.check();
    const status = report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    res.status(status).json(report);
  }
}
