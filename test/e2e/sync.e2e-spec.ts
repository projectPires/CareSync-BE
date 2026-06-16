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
 * Sync batch (#7) — idempotent replay, double-administration block, per-item
 * authz, item isolation, cross-tenant dedup key. Real Postgres; skips when down.
 */
const url =
  process.env.DATABASE_URL ?? 'postgresql://caresync_app:caresync_app@localhost:5432/caresync';
const ownerUrl =
  process.env.MIGRATION_DATABASE_URL ?? 'postgresql://caresync:caresync@localhost:5432/caresync';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: ownerUrl }) });

let app: INestApplication | undefined;
let dbUp = false;

const larA = randomUUID();
const larB = randomUUID();
const sfx = larA.slice(0, 8);
const PW = 'password-sync-1';
const emails = {
  nurse: `nurse-${sfx}@sync.pt`,
  aide: `aide-${sfx}@sync.pt`,
  nurseB: `nurseb-${sfx}@sync.pt`,
};
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};
let residentA = '';
let residentB = '';
let medAId = '';
let slot = 0;

async function makePending(): Promise<string> {
  const scheduledAt = new Date(Date.UTC(2026, 5, 15, 0, slot++, 0));
  const row = await forTenant(prisma, larA).medicationAdministration.create({
    data: {
      larId: larA,
      medicationId: medAId,
      residentId: residentA,
      scheduledAt,
      status: 'pending',
    },
  });
  return row.id;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    console.warn('⚠️  Sync e2e SKIPPED — Postgres unreachable.');
    return;
  }
  for (const [larId, name] of [
    [larA, 'Lar Sync A'],
    [larB, 'Lar Sync B'],
  ] as const) {
    await forTenant(prisma, larId).lar.create({
      data: { id: larId, name, legalName: 'x', nif: '1', address: {}, floors: 2, capacity: 10 },
    });
  }
  const mk = (larId: string, email: string, role: 'nurse' | 'aide', floors: number[]) =>
    forTenant(prisma, larId).user.create({
      data: {
        larId,
        email,
        name: `${role} sync`,
        role,
        floors,
        status: 'active',
        passwordHash: hashSync(PW, 10),
      },
    });
  ids.nurse = (await mk(larA, emails.nurse, 'nurse', [1])).id;
  await mk(larA, emails.aide, 'aide', [1]);
  await mk(larB, emails.nurseB, 'nurse', [1]);

  const mkRes = (larId: string, sns: string) =>
    forTenant(prisma, larId).resident.create({
      data: {
        larId,
        name: 'Residente Sync',
        dateOfBirth: new Date('1940-01-01'),
        gender: 'm',
        snsNumber: sns,
        room: '101',
        floor: 1,
        admittedAt: new Date('2026-01-01'),
        emergencyContact: { name: 'x', phone: 'x' },
        rgpdConsent: true,
      },
    });
  residentA = (await mkRes(larA, `sync-a-${sfx}`)).id;
  residentB = (await mkRes(larB, `sync-b-${sfx}`)).id;

  const plan = await forTenant(prisma, larA).medication.create({
    data: {
      larId: larA,
      residentId: residentA,
      drug: 'Lisinopril',
      dose: '10 mg',
      form: 'comp',
      route: 'oral',
      schedule: { times: ['08:00'] },
      prescribedBy: ids.nurse,
      startDate: new Date('2026-01-01'),
    },
  });
  medAId = plan.id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  for (const [who, email] of Object.entries(emails)) {
    const r = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PW });
    tokens[who] = r.body.access_token;
  }
});

afterAll(async () => {
  if (dbUp) {
    await owner.$executeRawUnsafe('SET session_replication_role = replica');
    for (const larId of [larA, larB]) {
      await owner.$executeRawUnsafe(
        'DELETE FROM medication_administration WHERE lar_id = $1',
        larId,
      );
      await owner.$executeRawUnsafe('DELETE FROM vital_reading WHERE lar_id = $1', larId);
      await owner.$executeRawUnsafe('DELETE FROM medication WHERE lar_id = $1', larId);
      await owner.$executeRawUnsafe('DELETE FROM resident WHERE lar_id = $1', larId);
      await owner.$executeRawUnsafe('DELETE FROM audit_log WHERE lar_id = $1', larId);
      await owner.$executeRawUnsafe(
        'DELETE FROM refresh_token WHERE user_id IN (SELECT id FROM "user" WHERE lar_id = $1)',
        larId,
      );
      await owner.$executeRawUnsafe('DELETE FROM "user" WHERE lar_id = $1', larId);
      await owner.$executeRawUnsafe('DELETE FROM lar WHERE id = $1', larId);
    }
    await owner.$executeRawUnsafe('SET session_replication_role = DEFAULT');
  }
  await app?.close();
  await prisma.$disconnect();
  await owner.$disconnect();
});

const batch = (who: string, mutations: object[]) =>
  request(app?.getHttpServer())
    .post('/api/sync/batch')
    .set('Authorization', `Bearer ${tokens[who]}`)
    .send({ mutations });

describe('Sync batch (#7, e2e)', () => {
  it('aplica vital novo; replay do mesmo batch → duplicate', async () => {
    if (!dbUp) return;
    const cid = randomUUID();
    const mutation = {
      client_id: cid,
      type: 'vital.create',
      payload: { resident_id: residentA, metric: 'hr', value: { value: 72 } },
    };
    const first = await batch('nurse', [mutation]);
    expect(first.status).toBe(201);
    expect(first.body.results[0].status).toBe('applied');

    const replay = await batch('nurse', [mutation]);
    expect(replay.body.results[0].status).toBe('duplicate');
  });

  it('confirmação via sync; 2ª confirmação (client_id diferente) → conflict { confirmed_by }', async () => {
    if (!dbUp) return;
    const adminId = await makePending();
    const ok = await batch('nurse', [
      {
        client_id: randomUUID(),
        type: 'administration.confirm',
        payload: { administration_id: adminId },
      },
    ]);
    expect(ok.body.results[0].status).toBe('applied');

    const dbl = await batch('nurse', [
      {
        client_id: randomUUID(),
        type: 'administration.confirm',
        payload: { administration_id: adminId },
      },
    ]);
    expect(dbl.body.results[0].status).toBe('conflict');
    expect(dbl.body.results[0].error.details.confirmed_by).toBe(ids.nurse);
    expect(dbl.body.results[0].error.details.confirmed_at).toBeTruthy();
  });

  it('autorização por item: auxiliar sem emar.administer → error FORBIDDEN', async () => {
    if (!dbUp) return;
    const adminId = await makePending();
    const res = await batch('aide', [
      {
        client_id: randomUUID(),
        type: 'administration.confirm',
        payload: { administration_id: adminId },
      },
    ]);
    expect(res.body.results[0].status).toBe('error');
    expect(res.body.results[0].error.code).toBe('FORBIDDEN');
  });

  it('isolamento por item: item inválido não aborta os outros', async () => {
    if (!dbUp) return;
    const res = await batch('nurse', [
      {
        client_id: randomUUID(),
        type: 'vital.create',
        payload: { resident_id: residentA, metric: 'hr', value: { value: 80 } },
      },
      {
        client_id: randomUUID(),
        type: 'vital.create',
        payload: { resident_id: residentA, metric: 'bp', value: { sys: 120 } },
      }, // falta dia → 422
      {
        client_id: randomUUID(),
        type: 'vital.create',
        payload: { resident_id: residentA, metric: 'temp', value: { value: 36.7 } },
      },
    ]);
    const st = res.body.results.map((r: { status: string }) => r.status);
    expect(st[0]).toBe('applied');
    expect(st[1]).toBe('error');
    expect(res.body.results[1].error.code).toBe('VALIDATION');
    expect(st[2]).toBe('applied');
  });

  it('recusa sem reason → error VALIDATION; com reason → applied', async () => {
    if (!dbUp) return;
    const adminId = await makePending();
    const res = await batch('nurse', [
      {
        client_id: randomUUID(),
        type: 'administration.refuse',
        payload: { administration_id: adminId },
      },
    ]);
    expect(res.body.results[0].status).toBe('error');
    expect(res.body.results[0].error.code).toBe('VALIDATION');

    const ok = await batch('nurse', [
      {
        client_id: randomUUID(),
        type: 'administration.refuse',
        payload: { administration_id: adminId, reason: 'Residente recusou' },
      },
    ]);
    expect(ok.body.results[0].status).toBe('applied');
    expect(ok.body.results[0].data.status).toBe('refused');
  });

  it('id-alvo em falta no payload → error VALIDATION (não INTERNAL)', async () => {
    if (!dbUp) return;
    const res = await batch('nurse', [
      { client_id: randomUUID(), type: 'administration.confirm', payload: {} },
    ]);
    expect(res.body.results[0].status).toBe('error');
    expect(res.body.results[0].error.code).toBe('VALIDATION');
  });

  it('cross-tenant: mesmo client_id noutro Lar é independente (não lê o Lar A)', async () => {
    if (!dbUp) return;
    const shared = randomUUID();
    const inA = await batch('nurse', [
      {
        client_id: shared,
        type: 'vital.create',
        payload: { resident_id: residentA, metric: 'hr', value: { value: 60 } },
      },
    ]);
    expect(inA.body.results[0].status).toBe('applied');

    // Mesmo client_id no Lar B → aplica (chave de idempotência é por-tenant), não duplicate.
    const inB = await batch('nurseB', [
      {
        client_id: shared,
        type: 'vital.create',
        payload: { resident_id: residentB, metric: 'hr', value: { value: 65 } },
      },
    ]);
    expect(inB.body.results[0].status).toBe('applied');
  });
});
