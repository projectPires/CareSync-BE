import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './token.service';

interface Row {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

function fakePrisma() {
  const rows = new Map<string, Row>();
  return {
    rows,
    refreshToken: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        rows.set(data.id, {
          ...data,
          rotatedAt: data.rotatedAt ?? null,
          revokedAt: data.revokedAt ?? null,
        });
        return rows.get(data.id);
      }),
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.get(where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { familyId?: string; userId?: string };
          data: Partial<Row>;
        }) => {
          for (const row of rows.values()) {
            const match =
              (where.familyId ? row.familyId === where.familyId : true) &&
              (where.userId ? row.userId === where.userId : true) &&
              row.revokedAt === null;
            if (match) Object.assign(row, data);
          }
        },
      ),
    },
  };
}

const config = { getOrThrow: () => 30 } as unknown as ConfigService;

describe('TokenService — rotating refresh tokens', () => {
  it('rotates: old token consumed, new token in the same family works', async () => {
    const prisma = fakePrisma();
    const svc = new TokenService(prisma as unknown as PrismaService, config);

    const t1 = await svc.issue('user-1');
    const { userId, newToken } = await svc.rotate(t1);
    expect(userId).toBe('user-1');
    expect(newToken).not.toBe(t1);

    const families = new Set([...prisma.rows.values()].map((r) => r.familyId));
    expect(families.size).toBe(1); // same family across rotation
  });

  it('REUSE of a rotated token revokes the whole family', async () => {
    const prisma = fakePrisma();
    const svc = new TokenService(prisma as unknown as PrismaService, config);

    const t1 = await svc.issue('user-1');
    const { newToken: t2 } = await svc.rotate(t1);

    await expect(svc.rotate(t1)).rejects.toThrow(/reuse/i); // theft signal
    await expect(svc.rotate(t2)).rejects.toThrow(UnauthorizedException); // family dead
  });

  it('rejects garbage and wrong-secret tokens', async () => {
    const prisma = fakePrisma();
    const svc = new TokenService(prisma as unknown as PrismaService, config);
    const t1 = await svc.issue('user-1');
    const [id] = t1.split('.');

    await expect(svc.rotate('garbage')).rejects.toThrow(UnauthorizedException);
    await expect(svc.rotate(`${id}.wrong-secret`)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects expired tokens', async () => {
    const prisma = fakePrisma();
    const svc = new TokenService(prisma as unknown as PrismaService, config);
    const t1 = await svc.issue('user-1');
    const [id] = t1.split('.');
    const row = prisma.rows.get(id);
    if (row) row.expiresAt = new Date(Date.now() - 1000);

    await expect(svc.rotate(t1)).rejects.toThrow(/expired/i);
  });
});
