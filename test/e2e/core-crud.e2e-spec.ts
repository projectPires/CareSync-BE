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
 * CRUD Lar/Users/Residents + PermissionsGuard contra Postgres real.
 * Lar próprio com: admin, nurse (piso 1), aide (piso 2).
 */
const url =
  process.env.DATABASE_URL ?? 'postgresql://caresync_app:caresync_app@localhost:5432/caresync';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

let app: INestApplication | undefined;
let dbUp = false;

const larId = randomUUID();
const sfx = larId.slice(0, 8);
const PW = 'password-e2e-123';
const emails = {
  admin: `admin-${sfx}@crud.pt`,
  nurse: `nurse-${sfx}@crud.pt`,
  aide: `aide-${sfx}@crud.pt`,
};
const tokens: Record<string, string> = {};
let aideId = '';

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    console.warn('⚠️  Core CRUD e2e SKIPPED — Postgres unreachable.');
    return;
  }

  const db = forTenant(prisma, larId);
  await db.lar.create({
    data: {
      id: larId,
      name: `Lar CRUD ${sfx}`,
      legalName: 'Lar CRUD, Lda.',
      nif: '1',
      address: {},
      floors: 2,
      capacity: 10,
    },
  });
  const mk = (
    email: string,
    role: 'admin' | 'nurse' | 'aide',
    floors: number[],
    licence?: string,
  ) =>
    db.user.create({
      data: {
        larId,
        email,
        name: `${role} e2e`,
        role,
        floors,
        licenceNumber: licence ?? null,
        status: 'active',
        passwordHash: hashSync(PW, 10),
      },
    });
  await mk(emails.admin, 'admin', []);
  await mk(emails.nurse, 'nurse', [1], '11111');
  const aide = await mk(emails.aide, 'aide', [2]);
  aideId = aide.id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  for (const [who, email] of Object.entries(emails)) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PW });
    tokens[who] = res.body.access_token;
  }
});

afterAll(async () => {
  if (dbUp) {
    const db = forTenant(prisma, larId);
    const users = await db.user.findMany({ select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await db.resident.deleteMany({});
    await db.user.deleteMany({});
    await db.lar.deleteMany({});
  }
  await app?.close();
  await prisma.$disconnect();
});

const http = () => request(app?.getHttpServer());
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

const residentPayload = (floor: number, sns: string, extra: object = {}) => ({
  name: 'João Teste Silva',
  date_of_birth: '1938-03-02',
  gender: 'm',
  sns_number: sns,
  room: `${floor}01`,
  floor,
  admitted_at: '2026-02-01',
  emergency_contact: { name: 'Filha', phone: '+351 910 000 001' },
  rgpd_consent: true,
  rgpd_consent_at: '2026-02-01',
  ...extra,
});

describe('Core CRUD + PermissionsGuard (e2e)', () => {
  let residentFloor1 = '';
  let residentFloor2 = '';

  it('admin cria residentes; nurse/aide recebem 403', async () => {
    if (!dbUp) return;
    const r1 = await http()
      .post('/api/residents')
      .set(as('admin'))
      .send(residentPayload(1, `s1-${sfx}`));
    expect(r1.status).toBe(201);
    residentFloor1 = r1.body.id;

    const r2 = await http()
      .post('/api/residents')
      .set(as('admin'))
      .send(residentPayload(2, `s2-${sfx}`));
    expect(r2.status).toBe(201);
    residentFloor2 = r2.body.id;

    const nurseTry = await http()
      .post('/api/residents')
      .set(as('nurse'))
      .send(residentPayload(1, `s3-${sfx}`));
    expect(nurseTry.status).toBe(403);
    const aideTry = await http()
      .post('/api/residents')
      .set(as('aide'))
      .send(residentPayload(2, `s4-${sfx}`));
    expect(aideTry.status).toBe(403);
  });

  it('SNS duplicado no mesmo Lar → 409', async () => {
    if (!dbUp) return;
    const dup = await http()
      .post('/api/residents')
      .set(as('admin'))
      .send(residentPayload(1, `s1-${sfx}`));
    expect(dup.status).toBe(409);
  });

  it('floor scoping server-side: nurse (piso 1) não vê nem acede ao piso 2', async () => {
    if (!dbUp) return;
    const list = await http().get('/api/residents').set(as('nurse'));
    expect(list.status).toBe(200);
    expect(list.body.every((r: { floor: number }) => r.floor === 1)).toBe(true);

    const direct = await http().get(`/api/residents/${residentFloor2}`).set(as('nurse'));
    expect(direct.status).toBe(404); // não revela existência

    const adminList = await http().get('/api/residents').set(as('admin'));
    expect(adminList.body.length).toBeGreaterThanOrEqual(2); // admin vê todos
  });

  it('nurse edita dados clínicos; aide não; nurse não edita dados administrativos', async () => {
    if (!dbUp) return;
    const ok = await http()
      .patch(`/api/residents/${residentFloor1}/clinical`)
      .set(as('nurse'))
      .send({ allergies: ['Penicilina'], status: 'atencao' });
    expect(ok.status).toBe(200);
    expect(ok.body.allergies).toEqual(['Penicilina']);

    const aideTry = await http()
      .patch(`/api/residents/${residentFloor2}/clinical`)
      .set(as('aide'))
      .send({ allergies: ['Pólen'] });
    expect(aideTry.status).toBe(403);

    const adminData = await http()
      .patch(`/api/residents/${residentFloor1}`)
      .set(as('nurse'))
      .send({ room: '999' });
    expect(adminData.status).toBe(403);
  });

  it('DNR: admin pode, nurse não; resposta traz sempre dnr explícito', async () => {
    if (!dbUp) return;
    const ok = await http()
      .patch(`/api/residents/${residentFloor1}/dnr`)
      .set(as('admin'))
      .send({ dnr: true, dnr_document_url: 'https://files.example.com/dnr.pdf' });
    expect(ok.status).toBe(200);
    expect(ok.body.dnr).toBe(true);

    const nurseTry = await http()
      .patch(`/api/residents/${residentFloor1}/dnr`)
      .set(as('nurse'))
      .send({ dnr: false });
    expect(nurseTry.status).toBe(403);

    const detail = await http().get(`/api/residents/${residentFloor1}`).set(as('nurse'));
    expect(typeof detail.body.dnr).toBe('boolean'); // regra clínica 6: nunca ausente
  });

  it('sem consentimento RGPD: nome vira iniciais + quarto, photo_url omitido', async () => {
    if (!dbUp) return;
    const created = await http()
      .post('/api/residents')
      .set(as('admin'))
      .send(residentPayload(1, `s5-${sfx}`, { rgpd_consent: false, rgpd_consent_at: undefined }));
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('J. T. S. · Quarto 101');
    expect(created.body).not.toHaveProperty('photo_url');
  });

  it('arquivar: exige reason, só admin, 409 em duplo arquivo; sai da lista por defeito', async () => {
    if (!dbUp) return;
    const noReason = await http()
      .post(`/api/residents/${residentFloor2}/archive`)
      .set(as('admin'))
      .send({});
    expect(noReason.status).toBe(400);

    const nurseTry = await http()
      .post(`/api/residents/${residentFloor2}/archive`)
      .set(as('nurse'))
      .send({ reason: 'discharge' });
    expect(nurseTry.status).toBe(403);

    const ok = await http()
      .post(`/api/residents/${residentFloor2}/archive`)
      .set(as('admin'))
      .send({ reason: 'discharge' });
    expect(ok.status).toBe(201);

    const again = await http()
      .post(`/api/residents/${residentFloor2}/archive`)
      .set(as('admin'))
      .send({ reason: 'death' });
    expect(again.status).toBe(409);

    const list = await http().get('/api/residents').set(as('admin'));
    expect(list.body.find((r: { id: string }) => r.id === residentFloor2)).toBeUndefined();

    const withArchived = await http().get('/api/residents?include_archived=true').set(as('admin'));
    expect(withArchived.body.find((r: { id: string }) => r.id === residentFloor2)).toBeDefined();
  });

  it('users: aide vê projeção mínima (sem email, sem hashes); admin vê tudo menos hashes', async () => {
    if (!dbUp) return;
    const aideView = await http().get('/api/users').set(as('aide'));
    expect(aideView.status).toBe(200);
    const sample = aideView.body[0];
    expect(sample).toHaveProperty('name');
    expect(sample).not.toHaveProperty('email');
    expect(JSON.stringify(aideView.body)).not.toMatch(/hash/i);

    const adminView = await http().get('/api/users').set(as('admin'));
    expect(adminView.body[0]).toHaveProperty('email');
    expect(JSON.stringify(adminView.body)).not.toMatch(/hash/i);
  });

  it('lar: admin lê e edita; nurse 403', async () => {
    if (!dbUp) return;
    const get = await http().get('/api/lar').set(as('admin'));
    expect(get.status).toBe(200);
    expect(get.body.id).toBe(larId);

    const patch = await http().patch('/api/lar').set(as('admin')).send({ capacity: 12 });
    expect(patch.status).toBe(200);
    expect(patch.body.capacity).toBe(12);

    const nurseTry = await http().get('/api/lar').set(as('nurse'));
    expect(nurseTry.status).toBe(403);
  });

  it('desativar worker: revoga sessões (login volta a 401) e reativar repõe', async () => {
    if (!dbUp) return;
    const off = await http().post(`/api/users/${aideId}/deactivate`).set(as('admin'));
    expect(off.status).toBe(204);

    const loginTry = await http()
      .post('/api/auth/login')
      .send({ email: emails.aide, password: PW });
    expect(loginTry.status).toBe(401);

    const on = await http().post(`/api/users/${aideId}/reactivate`).set(as('admin'));
    expect(on.status).toBe(204);
    const loginOk = await http().post('/api/auth/login').send({ email: emails.aide, password: PW });
    expect(loginOk.status).toBe(200);
  });

  it('nurse não desativa ninguém (403)', async () => {
    if (!dbUp) return;
    const res = await http().post(`/api/users/${aideId}/deactivate`).set(as('nurse'));
    expect(res.status).toBe(403);
  });
});
