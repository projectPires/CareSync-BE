import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Response } from 'express';
import { HealthController } from './health.controller';
import { HealthReport, HealthService } from './health.service';

function mockResponse(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe('HealthController', () => {
  async function makeController(report: HealthReport): Promise<HealthController> {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: { check: jest.fn().mockResolvedValue(report) } },
      ],
    }).compile();
    return moduleRef.get(HealthController);
  }

  it('returns 200 with checks when all dependencies are up', async () => {
    const controller = await makeController({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
    const res = mockResponse();
    await controller.check(res);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('returns 503 when any dependency is down', async () => {
    const controller = await makeController({
      status: 'degraded',
      checks: { database: 'down', redis: 'up' },
    });
    const res = mockResponse();
    await controller.check(res);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
