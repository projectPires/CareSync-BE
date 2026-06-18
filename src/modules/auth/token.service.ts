import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqualHex } from '../../common/crypto/safe-equal';
import { PrismaService } from '../../prisma/prisma.service';

export interface RefreshResult {
  userId: string;
  newToken: string;
}

/**
 * Rotating refresh tokens (RFC 6819 family pattern):
 * - token string = "<rowId>.<secret>"; only sha256(secret) is stored
 * - refresh marks the row rotated and issues a new row in the SAME family
 * - presenting an already-rotated/revoked token = theft signal → whole family
 *   revoked, caller must re-authenticate
 * Auth tables carry no lar_id (no RLS) — accessed via the base Prisma client.
 */
@Injectable()
export class TokenService {
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.ttlMs = config.getOrThrow<number>('JWT_REFRESH_TTL_DAYS') * 24 * 60 * 60 * 1000;
  }

  private hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  async issue(userId: string, familyId: string = randomUUID()): Promise<string> {
    const id = randomUUID();
    const secret = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        id,
        userId,
        familyId,
        tokenHash: this.hash(secret),
        expiresAt: new Date(Date.now() + this.ttlMs),
      },
    });
    return `${id}.${secret}`;
  }

  async rotate(presented: string): Promise<RefreshResult> {
    const [id, secret] = presented.split('.');
    if (!id || !secret) throw new UnauthorizedException('Malformed refresh token');

    const row = await this.prisma.refreshToken.findUnique({ where: { id } }).catch(() => null);
    if (!row || !timingSafeEqualHex(row.tokenHash, this.hash(secret))) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (row.revokedAt || row.rotatedAt) {
      // Reuse of a consumed token = theft signal → kill the whole family.
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('Refresh token reuse detected — session revoked');
    }
    if (row.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { rotatedAt: new Date() },
    });
    const newToken = await this.issue(row.userId, row.familyId);
    return { userId: row.userId, newToken };
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeByPresentedToken(presented: string): Promise<void> {
    const [id] = presented.split('.');
    if (!id) return;
    const row = await this.prisma.refreshToken.findUnique({ where: { id } }).catch(() => null);
    if (row) await this.revokeFamily(row.familyId);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
