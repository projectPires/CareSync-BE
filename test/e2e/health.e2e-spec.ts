import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * Boots the real app. Passes with docker-compose up (200/ok) AND without it
 * (503/degraded) — what it proves is wiring: /v1 versioning, module graph,
 * health checks executing against real config.
 */
describe('GET /api/health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds on the versioned route with a well-formed report', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect([200, 503]).toContain(res.status);
    expect(['ok', 'degraded']).toContain(res.body.status);
    expect(['up', 'down']).toContain(res.body.checks.database);
    expect(['up', 'down']).toContain(res.body.checks.redis);
  });

  it('is not exposed unversioned', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(404);
  });
});
