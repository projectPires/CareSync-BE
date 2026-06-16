import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { EmarService } from '../../src/modules/clinical/emar/emar.service';
import { forTenant } from '../../src/prisma/tenant';

/**
 * eMAR (#6) — append-only lifecycle, double-administration block, refusal,
 * aide delegation, RLS isolation, scheduler idempotency. Against real Postgres
 * (RLS + triggers are never mocked). Skips gracefully when Postgres is down.
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
const PW = 'password-emar-123';
const emails = {
  admin: `admin-${sfx}@emar.pt`,
  nurse: `nurse-${sfx}@emar.pt`,
  aide: `aide-${sfx}@emar.pt`,
  aidePlus: `aidep-${sfx}@emar.pt`,
  adminB: `adminb-${sfx}@emar.pt`,
};
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};
let residentA = '';
let planId = '';

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    console.warn('⚠️  eMAR e2e SKIPPED — Postgres unreachable.');
    return;
  }

  const a = forTenant(prisma, larA);
  const b = forTenant(prisma, larB);
  for (const [larId, name] of [
    [larA, 'Lar eMAR A'],
    [larB, 'Lar eMAR B'],
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
        name: `${role} emar`,
        role,
        floors,
        extraPermissions: extra,
        status: 'active',
        passwordHash: hashSync(PW, 10),
      },
    });

  ids.admin = (await mk(larA, emails.admin, 'admin', [])).id;
  ids.nurse = (await mk(larA, emails.nurse, 'nurse', [1], [])).id;
  ids.aide = (await mk(larA, emails.aide, 'aide', [1], [])).id;
  ids.aidePlus = (await mk(larA, emails.aidePlus, 'aide', [1], ['emar.administer'])).id;
  ids.adminB = (await mk(larB, emails.adminB, 'admin', [])).id;

  const res = await a.resident.create({
    data: {
      larId: larA,
      name: 'Residente eMAR',
      dateOfBirth: new Date('1940-01-01'),
      gender: 'm',
      snsNumber: `emar-${sfx}`,
      room: '101',
      floor: 1,
      admittedAt: new Date('2026-01-01'),
      emergencyContact: { name: 'x', phone: 'x' },
      rgpdConsent: true,
    },
  });
  residentA = res.id;

  // Plan with a broad schedule so the materialiser produces slots in 24h.
  const plan = await a.medication.create({
    data: {
      larId: larA,
      residentId: residentA,
      drug: 'Lisinopril',
      dose: '10 mg',
      form: 'comp',
      route: 'oral',
      schedule: { times: ['00:00', '06:00', '12:00', '18:00'] },
      prescribedBy: ids.admin,
      startDate: new Date('2026-01-01'),
    },
  });
  planId = plan.id;
  void b; // larB has only its admin

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
    // Owner (superuser) teardown: disable append-only triggers + bypass RLS to
    // remove clinical rows the app role can never DELETE.
    await owner.$executeRawUnsafe('SET session_replication_role = replica');
    for (const larId of [larA, larB]) {
      await owner.$executeRawUnsafe(
        'DELETE FROM medication_administration WHERE lar_id = $1',
        larId,
      );
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

const http = () => request(app?.getHttpServer());
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

let slotCounter = 0;
/** Insert a fresh pending administration directly (each on its own slot, today). */
async function makePending(): Promise<string> {
  // Anchor to "today" (server clock) so the daily eMAR window includes it.
  const scheduledAt = new Date(Date.now() - slotCounter++ * 60_000);
  const row = await forTenant(prisma, larA).medicationAdministration.create({
    data: {
      larId: larA,
      medicationId: planId,
      residentId: residentA,
      scheduledAt,
      status: 'pending',
    },
  });
  return row.id;
}

describe('eMAR (e2e)', () => {
  it('plano: admin cria (201); nurse e aide recebem 403', async () => {
    if (!dbUp) return;
    const ok = await http()
      .post(`/api/residents/${residentA}/medications`)
      .set(as('admin'))
      .send({
        drug: 'Paracetamol',
        dose: '500 mg',
        form: 'comp',
        route: 'oral',
        schedule: { times: ['08:00', '20:00'] },
        start_date: '2026-06-15',
      });
    expect(ok.status).toBe(201);
    expect(ok.body.drug).toBe('Paracetamol');

    const nurse = await http()
      .post(`/api/residents/${residentA}/medications`)
      .set(as('nurse'))
      .send({
        drug: 'x',
        dose: '1',
        form: 'comp',
        route: 'oral',
        schedule: {},
        start_date: '2026-06-15',
      });
    expect(nurse.status).toBe(403);

    const aide = await http().post(`/api/residents/${residentA}/medications`).set(as('aide')).send({
      drug: 'x',
      dose: '1',
      form: 'comp',
      route: 'oral',
      schedule: {},
      start_date: '2026-06-15',
    });
    expect(aide.status).toBe(403);
  });

  it('nurse confirma toma pendente → taken com administered_by', async () => {
    if (!dbUp) return;
    const id = await makePending();
    const res = await http().post(`/api/administrations/${id}/confirm`).set(as('nurse')).send({});
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('taken');
    expect(res.body.administered_by).toBe(ids.nurse);
    expect(res.body.administered_at).toBeTruthy();
    expect(res.body.supersedes_id).toBe(id); // append-only: nova linha supersede a pending
  });

  it('dupla confirmação (sequencial) → 409 com { confirmed_by, confirmed_at }', async () => {
    if (!dbUp) return;
    const id = await makePending();
    const first = await http().post(`/api/administrations/${id}/confirm`).set(as('nurse')).send({});
    expect(first.status).toBe(201);
    const second = await http()
      .post(`/api/administrations/${id}/confirm`)
      .set(as('admin'))
      .send({});
    expect(second.status).toBe(409);
    expect(second.body.details.confirmed_by).toBe(ids.nurse);
    expect(second.body.details.confirmed_at).toBeTruthy();
  });

  it('confirmação concorrente da mesma toma: exatamente um 201 e um 409', async () => {
    if (!dbUp) return;
    const id = await makePending();
    const [r1, r2] = await Promise.all([
      http().post(`/api/administrations/${id}/confirm`).set(as('nurse')).send({}),
      http().post(`/api/administrations/${id}/confirm`).set(as('admin')).send({}),
    ]);
    const codes = [r1.status, r2.status].sort();
    expect(codes).toEqual([201, 409]);
  });

  it('recusa sem reason → 422; com reason → 201 refused', async () => {
    if (!dbUp) return;
    const id = await makePending();
    const empty = await http().post(`/api/administrations/${id}/refuse`).set(as('nurse')).send({});
    expect(empty.status).toBe(422);
    const blank = await http()
      .post(`/api/administrations/${id}/refuse`)
      .set(as('nurse'))
      .send({ reason: '   ' });
    expect(blank.status).toBe(422);
    const ok = await http()
      .post(`/api/administrations/${id}/refuse`)
      .set(as('nurse'))
      .send({ reason: 'Residente recusou' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('refused');
    expect(ok.body.reason).toBe('Residente recusou');
  });

  it('auxiliar sem emar.administer → 403; com delegação (extra_permissions) → 201', async () => {
    if (!dbUp) return;
    const id1 = await makePending();
    const denied = await http()
      .post(`/api/administrations/${id1}/confirm`)
      .set(as('aide'))
      .send({});
    expect(denied.status).toBe(403);

    const id2 = await makePending();
    const allowed = await http()
      .post(`/api/administrations/${id2}/confirm`)
      .set(as('aidePlus'))
      .send({});
    expect(allowed.status).toBe(201);
    expect(allowed.body.status).toBe('taken');
  });

  it('transição inválida: confirmar uma toma já recusada → 409', async () => {
    if (!dbUp) return;
    const id = await makePending();
    const refused = await http()
      .post(`/api/administrations/${id}/refuse`)
      .set(as('nurse'))
      .send({ reason: 'recusou' });
    expect(refused.status).toBe(201);
    const confirm = await http()
      .post(`/api/administrations/${id}/confirm`)
      .set(as('nurse'))
      .send({});
    expect(confirm.status).toBe(409);
  });

  it('append-only: UPDATE direto em medication_administration é bloqueado (trigger)', async () => {
    if (!dbUp) return;
    const id = await makePending();
    await expect(
      forTenant(prisma, larA).medicationAdministration.update({
        where: { id },
        data: { status: 'taken' },
      }),
    ).rejects.toThrow();
  });

  it('RLS: utilizador de outro Lar não atua na administração (404)', async () => {
    if (!dbUp) return;
    const id = await makePending();
    const cross = await http()
      .post(`/api/administrations/${id}/confirm`)
      .set(as('adminB'))
      .send({});
    expect(cross.status).toBe(404);
  });

  it('GET /administrations: lista estado atual do dia (scoped ao residente)', async () => {
    if (!dbUp) return;
    const id = await makePending();
    await http().post(`/api/administrations/${id}/confirm`).set(as('nurse')).send({});
    // Sem date → dia de hoje (onde makePending ancora as tomas).
    const list = await http().get(`/api/administrations?resident_id=${residentA}`).set(as('nurse'));
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBeGreaterThan(0);
    expect(list.body.every((a: { resident_id: string }) => a.resident_id === residentA)).toBe(true);
  });

  it('GET /administrations: auxiliar ignora data histórica (cai para hoje); enfermeiro honra-a', async () => {
    if (!dbUp) return;
    const id = await makePending();
    await http().post(`/api/administrations/${id}/confirm`).set(as('nurse')).send({});

    // Auxiliar sem emar.read_history → data 2099 ignorada, devolve hoje (com dados).
    const aide = await http()
      .get(`/api/administrations?resident_id=${residentA}&date=2099-01-01`)
      .set(as('aide'));
    expect(aide.status).toBe(200);
    expect(aide.body.length).toBeGreaterThan(0);

    // Enfermeiro com emar.read_history → honra 2099 (sem dados nesse dia).
    const nurse = await http()
      .get(`/api/administrations?resident_id=${residentA}&date=2099-01-01`)
      .set(as('nurse'));
    expect(nurse.status).toBe(200);
    expect(nurse.body.length).toBe(0);
  });

  it('GET /administrations: outro Lar → 404 (não lista vazia)', async () => {
    if (!dbUp) return;
    const cross = await http()
      .get(`/api/administrations?resident_id=${residentA}`)
      .set(as('adminB'));
    expect(cross.status).toBe(404);
  });

  it('materializePending é idempotente: 2ª corrida não duplica (0 novas)', async () => {
    if (!dbUp) return;
    const emar = app?.get(EmarService) as EmarService;
    const first = await emar.materializePending(larA);
    const second = await emar.materializePending(larA);
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBe(0);
  });
});
