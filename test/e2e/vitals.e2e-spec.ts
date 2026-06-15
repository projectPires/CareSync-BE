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
 * Vitals (#8) — per-metric value validation, server-side abnormal flagging,
 * aide advanced-metric gate + 24h read cap, append-only correction, RLS.
 * Real Postgres; skips gracefully when down.
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
const PW = 'password-vitals-1';
const emails = {
  nurse: `nurse-${sfx}@vit.pt`,
  nurse2: `nurse2-${sfx}@vit.pt`, // piso 2 — teste de floor scoping
  aide: `aide-${sfx}@vit.pt`,
  aidePlus: `aidep-${sfx}@vit.pt`,
  adminB: `adminb-${sfx}@vit.pt`,
};
const tokens: Record<string, string> = {};
let residentA = '';

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    console.warn('⚠️  Vitals e2e SKIPPED — Postgres unreachable.');
    return;
  }
  for (const [larId, name] of [
    [larA, 'Lar Vitals A'],
    [larB, 'Lar Vitals B'],
  ] as const) {
    await forTenant(prisma, larId).lar.create({
      data: { id: larId, name, legalName: 'x', nif: '1', address: {}, floors: 2, capacity: 10 },
    });
  }
  const mk = (
    larId: string,
    email: string,
    role: 'admin' | 'nurse' | 'aide',
    floors: number[],
    extra: string[] = [],
  ) =>
    forTenant(prisma, larId).user.create({
      data: {
        larId,
        email,
        name: `${role} vit`,
        role,
        floors,
        extraPermissions: extra,
        status: 'active',
        passwordHash: hashSync(PW, 10),
      },
    });
  await mk(larA, emails.nurse, 'nurse', [1]);
  await mk(larA, emails.nurse2, 'nurse', [2]);
  await mk(larA, emails.aide, 'aide', [1]);
  await mk(larA, emails.aidePlus, 'aide', [1], ['vitals.record_advanced']);
  await mk(larB, emails.adminB, 'admin', []);

  const res = await forTenant(prisma, larA).resident.create({
    data: {
      larId: larA,
      name: 'Residente Vitals',
      dateOfBirth: new Date('1940-01-01'),
      gender: 'm',
      snsNumber: `vit-${sfx}`,
      room: '101',
      floor: 1,
      admittedAt: new Date('2026-01-01'),
      emergencyContact: { name: 'x', phone: 'x' },
      rgpdConsent: true,
    },
  });
  residentA = res.id;

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
      await owner.$executeRawUnsafe('DELETE FROM vital_reading WHERE lar_id = $1', larId);
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

const http = () => request(app?.getHttpServer());
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
const post = (who: string, body: object) =>
  http().post(`/api/residents/${residentA}/vitals`).set(as(who)).send(body);

describe('Vitals (e2e)', () => {
  it('validação por métrica: bp exige sys+dia; forma errada → 422', async () => {
    if (!dbUp) return;
    const ok = await post('nurse', { metric: 'bp', value: { sys: 128, dia: 82 } });
    expect(ok.status).toBe(201);
    expect(ok.body.abnormal).toBe(false);

    const bad = await post('nurse', { metric: 'bp', value: { sys: 128 } });
    expect(bad.status).toBe(422);
    const wrongShape = await post('nurse', { metric: 'hr', value: { sys: 1, dia: 1 } });
    expect(wrongShape.status).toBe(422);
  });

  it('abnormal calculado no servidor (TA sistólica > 140)', async () => {
    if (!dbUp) return;
    const res = await post('nurse', { metric: 'bp', value: { sys: 165, dia: 95 } });
    expect(res.status).toBe(201);
    expect(res.body.abnormal).toBe(true);
  });

  it('métricas básicas: auxiliar pode registar TA/FC/Temp', async () => {
    if (!dbUp) return;
    const r = await post('aide', { metric: 'hr', value: { value: 72 } });
    expect(r.status).toBe(201);
  });

  it('🔒 métricas avançadas: auxiliar 403; auxiliar com delegação 201', async () => {
    if (!dbUp) return;
    const denied = await post('aide', { metric: 'spo2', value: { value: 97 } });
    expect(denied.status).toBe(403);
    const allowed = await post('aidePlus', { metric: 'spo2', value: { value: 88 } });
    expect(allowed.status).toBe(201);
    expect(allowed.body.abnormal).toBe(true); // < 92
  });

  it('correção append-only: nova leitura + reason; sem reason → 422; original mantém-se', async () => {
    if (!dbUp) return;
    const orig = await post('nurse', { metric: 'glucose', value: { value: 110 } });
    expect(orig.status).toBe(201);
    const origId = orig.body.id;

    const noReason = await post('nurse', {
      metric: 'glucose',
      value: { value: 95 },
      supersedes_id: origId,
    });
    expect(noReason.status).toBe(422);

    const corrected = await post('nurse', {
      metric: 'glucose',
      value: { value: 95 },
      supersedes_id: origId,
      reason: 'valor mal introduzido',
    });
    expect(corrected.status).toBe(201);
    expect(corrected.body.supersedes_id).toBe(origId);

    // Histórico só mostra a leitura atual (a corrigida), não a superseded.
    const hist = await http()
      .get(`/api/residents/${residentA}/vitals?metric=glucose`)
      .set(as('nurse'));
    expect(hist.status).toBe(200);
    const ids = hist.body.map((v: { id: string }) => v.id);
    expect(ids).toContain(corrected.body.id);
    expect(ids).not.toContain(origId);
  });

  it('histórico: auxiliar limitado a 24h (leitura antiga fora da janela não aparece)', async () => {
    if (!dbUp) return;
    // Leitura com 48h → fora da janela de 24h do auxiliar, dentro da do enfermeiro.
    const old = new Date(Date.now() - 48 * 3600_000).toISOString();
    const created = await post('nurse', {
      metric: 'temp',
      value: { value: 36.8 },
      recorded_at: old,
    });
    expect(created.status).toBe(201);

    const aideView = await http()
      .get(`/api/residents/${residentA}/vitals?metric=temp`)
      .set(as('aide'));
    expect(aideView.status).toBe(200);
    expect(aideView.body.find((v: { id: string }) => v.id === created.body.id)).toBeUndefined();

    const nurseView = await http()
      .get(
        `/api/residents/${residentA}/vitals?metric=temp&from=${new Date(Date.now() - 72 * 3600_000).toISOString()}`,
      )
      .set(as('nurse'));
    expect(nurseView.body.find((v: { id: string }) => v.id === created.body.id)).toBeDefined();
  });

  it('append-only: UPDATE direto em vital_reading é bloqueado (trigger)', async () => {
    if (!dbUp) return;
    const r = await post('nurse', { metric: 'hr', value: { value: 80 } });
    await expect(
      forTenant(prisma, larA).vitalReading.update({
        where: { id: r.body.id },
        data: { abnormal: true },
      }),
    ).rejects.toThrow();
  });

  it('floor scoping: enfermeiro do piso 2 não regista no residente do piso 1 (404)', async () => {
    if (!dbUp) return;
    const wrongFloor = await post('nurse2', { metric: 'hr', value: { value: 80 } });
    expect(wrongFloor.status).toBe(404); // não revela existência (regra clínica 7)
  });

  it('correção cross-métrica é rejeitada (supersedes aponta a métrica diferente → 404)', async () => {
    if (!dbUp) return;
    const bp = await post('nurse', { metric: 'bp', value: { sys: 120, dia: 80 } });
    expect(bp.status).toBe(201);
    const cross = await post('nurse', {
      metric: 'hr',
      value: { value: 70 },
      supersedes_id: bp.body.id,
      reason: 'tentativa inválida',
    });
    expect(cross.status).toBe(404);
  });

  it('histórico: from/to inválido → 400', async () => {
    if (!dbUp) return;
    const bad = await http()
      .get(`/api/residents/${residentA}/vitals?from=garbage`)
      .set(as('nurse'));
    expect(bad.status).toBe(400);
  });

  it('RLS: utilizador de outro Lar → 404 (não revela residente)', async () => {
    if (!dbUp) return;
    const cross = await post('adminB', { metric: 'hr', value: { value: 80 } });
    expect(cross.status).toBe(404);
  });
});
