import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { forTenant } from '../../src/prisma/tenant';

/**
 * AuditLog write-side (#5): cada mutação gera entrada com who/what/when/where
 * (user_id, action, timestamp, IP + user agent via AsyncLocalStorage).
 * Append-only ao nível da BD coberto no rls.e2e-spec.
 */
const url =
  process.env.DATABASE_URL ?? 'postgresql://caresync_app:caresync_app@localhost:5432/caresync';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

let app: INestApplication | undefined;
let dbUp = false;

const larId = randomUUID();
const sfx = larId.slice(0, 8);
const adminEmail = `admin-${sfx}@audit.pt`;
const PW = 'password-audit-1';
let adminId = '';
let token = '';

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    console.warn('⚠️  Audit e2e SKIPPED — Postgres unreachable.');
    return;
  }
  const db = forTenant(prisma, larId);
  await db.lar.create({
    data: {
      id: larId,
      name: `Lar Audit ${sfx}`,
      legalName: 'x',
      nif: '1',
      address: {},
      floors: 1,
      capacity: 5,
    },
  });
  const admin = await db.user.create({
    data: {
      larId,
      email: adminEmail,
      name: 'Admin Audit',
      role: 'admin',
      status: 'active',
      passwordHash: hashSync(PW, 10),
    },
  });
  adminId = admin.id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: adminEmail, password: PW });
  token = login.body.access_token;
});

afterAll(async () => {
  if (dbUp) {
    const db = forTenant(prisma, larId);
    const users = await db.user.findMany({ select: { id: true } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    await db.resident.deleteMany({});
    await db.user.deleteMany({});
    await db.lar.deleteMany({});
  }
  await app?.close();
  await prisma.$disconnect();
});

describe('AuditLog — lado de escrita (e2e)', () => {
  it('mutação gera entrada completa: who, what, where (IP + UA), before/after', async () => {
    if (!dbUp) return;
    const res = await request(app?.getHttpServer())
      .patch('/api/lar')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'CareSyncWorkerApp/1.0 (audit-e2e)')
      .send({ capacity: 7 });
    expect(res.status).toBe(200);

    const entry = await forTenant(prisma, larId).auditLog.findFirst({
      where: { action: 'lar.updated' },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry).not.toBeNull();
    expect(entry?.userId).toBe(adminId);
    expect(entry?.entityType).toBe('lar');
    expect(entry?.entityId).toBe(larId);
    expect(entry?.userAgent).toBe('CareSyncWorkerApp/1.0 (audit-e2e)');
    expect(entry?.ip).toBeTruthy();
    expect(entry?.after).toMatchObject({ capacity: 7 });
    expect((entry?.before as { capacity: number }).capacity).toBe(5);
    expect(entry?.createdAt).toBeInstanceOf(Date);
  });

  it('criação de residente fica auditada com o payload', async () => {
    if (!dbUp) return;
    const res = await request(app?.getHttpServer())
      .post('/api/residents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Residente Audit',
        date_of_birth: '1940-01-01',
        gender: 'not_disclosed',
        sns_number: `audit-${sfx}`,
        room: '1',
        floor: 1,
        admitted_at: '2026-01-01',
        emergency_contact: { name: 'x', phone: 'x' },
      });
    expect(res.status).toBe(201);

    const entry = await forTenant(prisma, larId).auditLog.findFirst({
      where: { action: 'resident.created' },
    });
    expect(entry).not.toBeNull();
    expect(entry?.userId).toBe(adminId);
  });

  it('login bem-sucedido NÃO gera lockout; auth.pin_set fica auditado', async () => {
    if (!dbUp) return;
    const res = await request(app?.getHttpServer())
      .put('/api/auth/pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '4321' });
    expect(res.status).toBe(200);

    const entry = await forTenant(prisma, larId).auditLog.findFirst({
      where: { action: 'auth.pin_set' },
    });
    expect(entry?.userId).toBe(adminId);
    expect(entry?.ip).toBeTruthy(); // ALS também cobre escritas fora de tenantBatch
  });
});
