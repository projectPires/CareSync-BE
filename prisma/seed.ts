import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';
import { forTenant } from '../src/prisma/tenant';

/**
 * Dev seed: 1 Lar demo + 1 admin + 3 workers + 5 residentes.
 * Idempotent — re-running upserts on natural keys.
 * RLS + FORCE applies even to the table owner, so every write goes through
 * forTenant() with the demo Lar's own id as tenant context.
 */
const DEMO_LAR_ID = 'a0000000-0000-4000-8000-000000000001';

async function main(): Promise<void> {
  const url =
    process.env.DATABASE_URL ?? 'postgresql://caresync_app:caresync_app@localhost:5432/caresync';
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const db = forTenant(prisma, DEMO_LAR_ID);

  await db.lar.upsert({
    where: { id: DEMO_LAR_ID },
    update: {},
    create: {
      id: DEMO_LAR_ID,
      name: 'Lar Bem-Estar (demo)',
      legalName: 'Lar Bem-Estar, Lda.',
      nif: '500100200',
      address: { street: 'Rua das Flores 12', postal: '1200-192', city: 'Lisboa' },
      floors: 2,
      capacity: 30,
      config: {
        shiftTimes: { morning: '07:00-15:00', afternoon: '15:00-23:00', night: '23:00-07:00' },
      },
      status: 'active',
    },
  });

  await db.subscription.upsert({
    where: { id: 'a0000000-0000-4000-8000-000000000002' },
    update: {},
    create: {
      id: 'a0000000-0000-4000-8000-000000000002',
      larId: DEMO_LAR_ID,
      seats: 10,
      billingCycle: 'monthly',
      startedAt: new Date('2026-06-01'),
      renewalDate: new Date('2026-07-01'),
      status: 'active',
    },
  });

  const users = [
    {
      email: 'helena@larbemestar.pt',
      name: 'Helena Marques',
      role: 'admin' as const,
      floors: [] as number[],
      password: 'demo-admin-123',
    },
    {
      email: 'sofia@larbemestar.pt',
      name: 'Sofia Fonseca',
      role: 'nurse' as const,
      floors: [2],
      password: 'demo-nurse-123',
      licenceNumber: '78421',
    },
    {
      email: 'ines@larbemestar.pt',
      name: 'Inês Pereira',
      role: 'aide' as const,
      floors: [1, 2],
      password: 'demo-aide-123',
    },
    {
      email: 'carlos@larbemestar.pt',
      name: 'Carlos Antunes',
      role: 'aide' as const,
      floors: [1],
      password: 'demo-aide-456',
    },
  ];
  for (const u of users) {
    await db.user.upsert({
      where: { larId_email: { larId: DEMO_LAR_ID, email: u.email } },
      update: {},
      create: {
        larId: DEMO_LAR_ID,
        email: u.email,
        name: u.name,
        role: u.role,
        floors: u.floors,
        licenceNumber: 'licenceNumber' in u ? u.licenceNumber : null,
        passwordHash: hashSync(u.password, 10),
        status: 'active',
      },
    });
  }

  const residents = [
    { name: 'Manuel Sousa', room: '101', floor: 1, sns: '111111111', dnr: false },
    { name: 'Maria Silva', room: '102', floor: 1, sns: '222222222', dnr: true },
    { name: 'António Costa', room: '201', floor: 2, sns: '333333333', dnr: false },
    { name: 'Berta Lopes', room: '202', floor: 2, sns: '444444444', dnr: false },
    { name: 'Joaquim Neves', room: '203', floor: 2, sns: '555555555', dnr: false },
  ];
  for (const r of residents) {
    await db.resident.upsert({
      where: { larId_snsNumber: { larId: DEMO_LAR_ID, snsNumber: r.sns } },
      update: {},
      create: {
        larId: DEMO_LAR_ID,
        name: r.name,
        dateOfBirth: new Date('1940-05-15'),
        gender: 'not_disclosed',
        snsNumber: r.sns,
        room: r.room,
        floor: r.floor,
        allergies: r.dnr ? ['Penicilina'] : [],
        admittedAt: new Date('2026-01-10'),
        rgpdConsent: true,
        rgpdConsentAt: new Date('2026-01-10'),
        emergencyContact: {
          name: 'Família (demo)',
          relation: 'filho(a)',
          phone: '+351 910 000 000',
        },
        dnr: r.dnr,
      },
    });
  }

  console.log(
    `Seed ok — Lar demo ${DEMO_LAR_ID}: ${users.length} users, ${residents.length} residentes.`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
