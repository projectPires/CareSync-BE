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
 * Worker resident endpoints (#9) — updated_since delta fetch (residents +
 * medications), updated_at cursor, archived exclusion. Real Postgres; skips
 * when down. (Floor scoping / consent gating / RLS covered by core-crud e2e.)
 */
const url =
  process.env.DATABASE_URL ?? 'postgresql://caresync_app:caresync_app@localhost:5432/caresync';
const ownerUrl =
  process.env.MIGRATION_DATABASE_URL ?? 'postgresql://caresync:caresync@localhost:5432/caresync';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: ownerUrl }) });

let app: INestApplication | undefined;
let dbUp = false;

const larId = randomUUID();
const sfx = larId.slice(0, 8);
const PW = 'password-wr-1';
const emails = { admin: `admin-${sfx}@wr.pt`, nurse: `nurse-${sfx}@wr.pt` };
const tokens: Record<string, string> = {};
let residentA = '';
let residentArch = '';

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    console.warn('⚠️  Worker-residents e2e SKIPPED — Postgres unreachable.');
    return;
  }
  const db = forTenant(prisma, larId);
  await db.lar.create({
    data: {
      id: larId,
      name: `Lar WR ${sfx}`,
      legalName: 'x',
      nif: '1',
      address: {},
      floors: 2,
      capacity: 10,
    },
  });
  const mk = (email: string, role: 'admin' | 'nurse', floors: number[]) =>
    db.user.create({
      data: {
        larId,
        email,
        name: `${role} wr`,
        role,
        floors,
        status: 'active',
        passwordHash: hashSync(PW, 10),
      },
    });
  await mk(emails.admin, 'admin', []);
  await mk(emails.nurse, 'nurse', [1]);

  const mkRes = (sns: string) =>
    db.resident.create({
      data: {
        larId,
        name: 'Residente WR',
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
  residentA = (await mkRes(`wr-a-${sfx}`)).id;
  residentArch = (await mkRes(`wr-arch-${sfx}`)).id;

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
    await owner.$executeRawUnsafe('DELETE FROM medication_administration WHERE lar_id = $1', larId);
    await owner.$executeRawUnsafe('DELETE FROM medication WHERE lar_id = $1', larId);
    await owner.$executeRawUnsafe('DELETE FROM resident WHERE lar_id = $1', larId);
    await owner.$executeRawUnsafe('DELETE FROM audit_log WHERE lar_id = $1', larId);
    await owner.$executeRawUnsafe(
      'DELETE FROM refresh_token WHERE user_id IN (SELECT id FROM "user" WHERE lar_id = $1)',
      larId,
    );
    await owner.$executeRawUnsafe('DELETE FROM "user" WHERE lar_id = $1', larId);
    await owner.$executeRawUnsafe('DELETE FROM lar WHERE id = $1', larId);
    await owner.$executeRawUnsafe('SET session_replication_role = DEFAULT');
  }
  await app?.close();
  await prisma.$disconnect();
  await owner.$disconnect();
});

const http = () => request(app?.getHttpServer());
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
const cursorBefore = (iso: string) => new Date(new Date(iso).getTime() - 2000).toISOString();
const cursorAfter = (iso: string) => new Date(new Date(iso).getTime() + 2000).toISOString();

describe('Worker resident endpoints — delta fetch (#9, e2e)', () => {
  it('lista de residentes inclui updated_at (cursor do delta)', async () => {
    if (!dbUp) return;
    const list = await http().get('/api/residents').set(as('nurse'));
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(0);
    expect(typeof list.body[0].updated_at).toBe('string');
  });

  it('updated_since: residente alterado entra no delta; cursor posterior exclui-o', async () => {
    if (!dbUp) return;
    const patch = await http()
      .patch(`/api/residents/${residentA}/clinical`)
      .set(as('nurse'))
      .send({ allergies: ['Penicilina'] });
    expect(patch.status).toBe(200);
    const u = patch.body.updated_at as string;

    const included = await http()
      .get(`/api/residents?updated_since=${cursorBefore(u)}`)
      .set(as('nurse'));
    expect(included.body.find((r: { id: string }) => r.id === residentA)).toBeDefined();

    const excluded = await http()
      .get(`/api/residents?updated_since=${cursorAfter(u)}`)
      .set(as('nurse'));
    expect(excluded.body.find((r: { id: string }) => r.id === residentA)).toBeUndefined();
  });

  it('updated_since inválido → 400', async () => {
    if (!dbUp) return;
    const bad = await http().get('/api/residents?updated_since=garbage').set(as('nurse'));
    expect(bad.status).toBe(400);
  });

  it('arquivado fora do delta por defeito; include_archived (admin) repõe', async () => {
    if (!dbUp) return;
    const arch = await http()
      .post(`/api/residents/${residentArch}/archive`)
      .set(as('admin'))
      .send({ reason: 'discharge' });
    expect(arch.status).toBe(201);

    const delta = await http()
      .get('/api/residents?updated_since=2026-01-01T00:00:00.000Z')
      .set(as('admin'));
    expect(delta.body.find((r: { id: string }) => r.id === residentArch)).toBeUndefined();

    const withArch = await http()
      .get('/api/residents?updated_since=2026-01-01T00:00:00.000Z&include_archived=true')
      .set(as('admin'));
    expect(withArch.body.find((r: { id: string }) => r.id === residentArch)).toBeDefined();
  });

  it('medicações: updated_at presente + updated_since filtra plano alterado', async () => {
    if (!dbUp) return;
    const create = await http()
      .post(`/api/residents/${residentA}/medications`)
      .set(as('admin'))
      .send({
        drug: 'Lisinopril',
        dose: '10 mg',
        form: 'comp',
        route: 'oral',
        schedule: { times: ['08:00'] },
        start_date: '2026-06-15',
      });
    expect(create.status).toBe(201);
    expect(typeof create.body.updated_at).toBe('string');
    const planId = create.body.id;

    const patch = await http()
      .patch(`/api/residents/${residentA}/medications/${planId}`)
      .set(as('admin'))
      .send({ dose: '20 mg' });
    expect(patch.status).toBe(200);
    const u = patch.body.updated_at as string;

    const included = await http()
      .get(`/api/residents/${residentA}/medications?updated_since=${cursorBefore(u)}`)
      .set(as('nurse'));
    expect(included.body.find((m: { id: string }) => m.id === planId)).toBeDefined();

    const excluded = await http()
      .get(`/api/residents/${residentA}/medications?updated_since=${cursorAfter(u)}`)
      .set(as('nurse'));
    expect(excluded.body.find((m: { id: string }) => m.id === planId)).toBeUndefined();
  });
});
