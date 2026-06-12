import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { forTenant } from '../../src/prisma/tenant';

/**
 * Auth flows against real Postgres + Redis (skips when Docker is down).
 * Creates its own Lar + users — independent from the demo seed.
 */
const url =
  process.env.DATABASE_URL ?? 'postgresql://caresync_app:caresync_app@localhost:5432/caresync';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

let app: INestApplication | undefined;
let dbUp = false;

const larId = randomUUID();
const suffix = larId.slice(0, 8);
const adminEmail = `admin-${suffix}@auth-e2e.pt`;
const nurseEmail = `nurse-${suffix}@auth-e2e.pt`;
const PASSWORD = 'super-secret-pw-1';

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    console.warn('⚠️  Auth e2e SKIPPED — Postgres unreachable (docker compose up -d).');
    return;
  }

  const db = forTenant(prisma, larId);
  await db.lar.create({
    data: {
      id: larId,
      name: `Lar Auth ${suffix}`,
      legalName: 'x',
      nif: '1',
      address: {},
      floors: 1,
      capacity: 5,
    },
  });
  await db.user.create({
    data: {
      larId,
      email: adminEmail,
      name: 'Admin E2E',
      role: 'admin',
      status: 'active',
      passwordHash: hashSync(PASSWORD, 10),
      pinHash: hashSync('1234', 10),
    },
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
});

afterAll(async () => {
  if (dbUp) {
    const db = forTenant(prisma, larId);
    const users = await db.user.findMany({});
    const ids = users.map((u) => u.id);
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.inviteToken.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({});
    await db.lar.deleteMany({});
  }
  await app?.close();
  await prisma.$disconnect();
});

const http = () => request(app?.getHttpServer());

describe('Auth (e2e, real Postgres + Redis)', () => {
  it('login → access + refresh + user payload, no hashes serialized', async () => {
    if (!dbUp) return;
    const res = await http().post('/v1/auth/login').send({ email: adminEmail, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.refresh_token).toMatch(/^[0-9a-f-]{36}\./);
    expect(res.body.user.lar_id).toBe(larId);
    expect(JSON.stringify(res.body)).not.toMatch(/hash/i); // red line 8
  });

  it('wrong password → uniform 401', async () => {
    if (!dbUp) return;
    const res = await http()
      .post('/v1/auth/login')
      .send({ email: adminEmail, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Credenciais inválidas');
  });

  it('unknown email → same uniform 401 (no user oracle)', async () => {
    if (!dbUp) return;
    const res = await http()
      .post('/v1/auth/login')
      .send({ email: `ghost-${suffix}@auth-e2e.pt`, password: 'whatever-123' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Credenciais inválidas');
  });

  it('PIN login works', async () => {
    if (!dbUp) return;
    const res = await http().post('/v1/auth/pin').send({ email: adminEmail, pin: '1234' });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeDefined();
  });

  it('refresh rotates; reusing the old token revokes the family', async () => {
    if (!dbUp) return;
    const login = await http()
      .post('/v1/auth/login')
      .send({ email: adminEmail, password: PASSWORD });
    const r1 = login.body.refresh_token;

    const rot = await http().post('/v1/auth/refresh').send({ refresh_token: r1 });
    expect(rot.status).toBe(200);
    const r2 = rot.body.refresh_token;
    expect(r2).not.toBe(r1);

    const reuse = await http().post('/v1/auth/refresh').send({ refresh_token: r1 });
    expect(reuse.status).toBe(401); // theft signal

    const afterRevoke = await http().post('/v1/auth/refresh').send({ refresh_token: r2 });
    expect(afterRevoke.status).toBe(401); // whole family dead
  });

  it('protected route without token → 401; with token → not 401', async () => {
    if (!dbUp) return;
    const noToken = await http().put('/v1/auth/pin').send({ pin: '5678' });
    expect(noToken.status).toBe(401);

    const login = await http()
      .post('/v1/auth/login')
      .send({ email: adminEmail, password: PASSWORD });
    const withToken = await http()
      .put('/v1/auth/pin')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .send({ pin: '5678' });
    expect(withToken.status).toBe(200);
  });

  it('full invite flow: invite (admin) → accept → login as new user', async () => {
    if (!dbUp) return;
    const login = await http()
      .post('/v1/auth/login')
      .send({ email: adminEmail, password: PASSWORD });
    const bearer = `Bearer ${login.body.access_token}`;

    const invite = await http()
      .post('/v1/auth/invite')
      .set('Authorization', bearer)
      .send({
        email: nurseEmail,
        name: 'Sofia E2E',
        role: 'nurse',
        floors: [1],
        licence_number: '99999',
      });
    expect(invite.status).toBe(201);
    const token = new URL(
      invite.body.accept_url.replace('caresync://', 'https://x/'),
    ).searchParams.get('token');
    expect(token).toBeTruthy();

    const accept = await http()
      .post('/v1/auth/invite/accept')
      .send({ token, password: 'nurse-password-1' });
    expect(accept.status).toBe(200);

    const nurseLogin = await http()
      .post('/v1/auth/login')
      .send({ email: nurseEmail, password: 'nurse-password-1' });
    expect(nurseLogin.status).toBe(200);
    expect(nurseLogin.body.user.role).toBe('nurse');
  });

  it('non-admin cannot invite (403)', async () => {
    if (!dbUp) return;
    const nurseLogin = await http()
      .post('/v1/auth/login')
      .send({ email: nurseEmail, password: 'nurse-password-1' });
    const res = await http()
      .post('/v1/auth/invite')
      .set('Authorization', `Bearer ${nurseLogin.body.access_token}`)
      .send({ email: `x-${suffix}@auth-e2e.pt`, name: 'Xavier', role: 'aide', floors: [1] });
    expect(res.status).toBe(403);
  });

  it('5 wrong passwords → 423 locked (even with the right password after)', async () => {
    if (!dbUp) return;
    const email = nurseEmail;
    for (let i = 0; i < 5; i++) {
      await http().post('/v1/auth/login').send({ email, password: 'totally-wrong-1' });
    }
    const locked = await http()
      .post('/v1/auth/login')
      .send({ email, password: 'nurse-password-1' });
    expect(locked.status).toBe(423);
  });
});
