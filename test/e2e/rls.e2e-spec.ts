import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { forTenant } from '../../src/prisma/tenant';

/**
 * RLS isolation suite — REQUIRES a real Postgres with migrations applied
 * (docker compose up -d && pnpm prisma migrate deploy). Mocks prove nothing
 * about row-level security (test-engineer non-negotiable 1).
 *
 * When the database is unreachable the suite SKIPS (warns loudly) so the
 * rest of the e2e suite still runs on machines without Docker.
 */
const url = process.env.DATABASE_URL ?? 'postgresql://caresync:caresync@localhost:5432/caresync';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
let dbUp = false;

const larA = randomUUID();
const larB = randomUUID();

function makeLar(id: string, suffix: string) {
  return {
    id,
    name: `Lar RLS ${suffix}`,
    legalName: `Lar RLS ${suffix}, Lda.`,
    nif: '999999999',
    address: { city: 'Lisboa' },
    floors: 1,
    capacity: 10,
  };
}

function makeResident(larId: string, suffix: string) {
  return {
    larId,
    name: `Residente ${suffix}`,
    dateOfBirth: new Date('1940-01-01'),
    gender: 'not_disclosed' as const,
    snsNumber: `sns-${suffix}`,
    room: '1',
    floor: 1,
    admittedAt: new Date('2026-01-01'),
    emergencyContact: { name: 'x', phone: 'x' },
  };
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    console.warn(
      '⚠️  RLS e2e SKIPPED — Postgres unreachable. Run: docker compose up -d && pnpm prisma migrate deploy',
    );
    return;
  }
  const a = forTenant(prisma, larA);
  const b = forTenant(prisma, larB);
  await a.lar.create({ data: makeLar(larA, `A-${larA.slice(0, 8)}`) });
  await b.lar.create({ data: makeLar(larB, `B-${larB.slice(0, 8)}`) });
  await a.resident.create({ data: makeResident(larA, `A-${larA.slice(0, 8)}`) });
  await b.resident.create({ data: makeResident(larB, `B-${larB.slice(0, 8)}`) });
});

afterAll(async () => {
  if (dbUp) {
    // tenant context required even for cleanup — FORCE RLS applies to owner
    const a = forTenant(prisma, larA);
    const b = forTenant(prisma, larB);
    await a.resident.deleteMany({});
    await b.resident.deleteMany({});
    await a.lar.deleteMany({});
    await b.lar.deleteMany({});
  }
  await prisma.$disconnect();
});

describe('Row-Level Security (real Postgres)', () => {
  it('tenant A sees only its own residents', async () => {
    if (!dbUp) return;
    const rows = await forTenant(prisma, larA).resident.findMany({});
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.larId === larA)).toBe(true);
  });

  it('cross-tenant read returns 0 rows, never an error', async () => {
    if (!dbUp) return;
    const rows = await forTenant(prisma, larB).resident.findMany({
      where: { larId: larA },
    });
    expect(rows).toHaveLength(0);
  });

  it('raw client without tenant context reads 0 tenant rows', async () => {
    if (!dbUp) return;
    const rows = await prisma.resident.findMany({});
    expect(rows).toHaveLength(0);
  });

  it('write with mismatched lar_id is rejected by WITH CHECK', async () => {
    if (!dbUp) return;
    await expect(
      forTenant(prisma, larB).resident.create({
        data: makeResident(larA, `evil-${larB.slice(0, 8)}`),
      }),
    ).rejects.toThrow();
  });

  it('double medication administration is blocked by the partial unique index', async () => {
    if (!dbUp) return;
    const a = forTenant(prisma, larA);
    const resident = await a.resident.findFirstOrThrow({});
    const medication = await a.medication.create({
      data: {
        larId: larA,
        residentId: resident.id,
        drug: 'Lisinopril',
        dose: '10 mg',
        form: 'comp',
        route: 'oral',
        schedule: { times: ['08:00'] },
        prescribedBy: randomUUID(),
        startDate: new Date('2026-06-01'),
      },
    });
    const scheduledAt = new Date('2026-06-12T08:00:00Z');
    const base = {
      larId: larA,
      medicationId: medication.id,
      residentId: resident.id,
      scheduledAt,
      status: 'taken' as const,
      administeredAt: new Date(),
      administeredBy: randomUUID(),
    };
    await a.medicationAdministration.create({ data: base });
    await expect(a.medicationAdministration.create({ data: { ...base } })).rejects.toThrow(); // unique violation — clinical hard rule 2
  });

  it('audit_log refuses UPDATE and DELETE (append-only triggers)', async () => {
    if (!dbUp) return;
    const a = forTenant(prisma, larA);
    const entry = await a.auditLog.create({
      data: {
        larId: larA,
        action: 'test.append_only',
        entityType: 'test',
      },
    });
    await expect(
      a.auditLog.update({ where: { id: entry.id }, data: { action: 'tampered' } }),
    ).rejects.toThrow(/append-only/);
    await expect(a.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(/append-only/);
  });
});
