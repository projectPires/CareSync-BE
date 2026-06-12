import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtPayload } from '../../common/auth/jwt-payload';
import { PrismaService } from '../../prisma/prisma.service';
import { forTenant, tenantBatch } from '../../prisma/tenant';
import { TokenService } from '../auth/token.service';
import { UpdateUserDto } from './dto/user.dto';

/**
 * Hashes NUNCA saem daqui (linha vermelha RGPD 8): selects explícitos, sem
 * passwordHash/pinHash em nenhuma projeção.
 */
const ADMIN_SELECT = {
  id: true,
  larId: true,
  email: true,
  name: true,
  role: true,
  licenceNumber: true,
  floors: true,
  extraPermissions: true,
  biometricEnabled: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/** Projeção mínima para workers (matriz: lista read-only — need to know). */
const WORKER_SELECT = {
  id: true,
  name: true,
  role: true,
  floors: true,
  status: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  list(actor: JwtPayload) {
    const select = actor.role === 'admin' ? ADMIN_SELECT : WORKER_SELECT;
    return forTenant(this.prisma, actor.lar_id).user.findMany({
      select,
      orderBy: { name: 'asc' },
    });
  }

  async getById(actor: JwtPayload, id: string) {
    const select = actor.role === 'admin' ? ADMIN_SELECT : WORKER_SELECT;
    const user = await forTenant(this.prisma, actor.lar_id).user.findUnique({
      where: { id },
      select,
    });
    if (!user) throw new NotFoundException('Worker não encontrado');
    return user;
  }

  async update(actor: JwtPayload, id: string, dto: UpdateUserDto) {
    const db = forTenant(this.prisma, actor.lar_id);
    const existing = await db.user.findUnique({ where: { id }, select: ADMIN_SELECT });
    if (!existing) throw new NotFoundException('Worker não encontrado');

    const targetRole = dto.role ?? existing.role;
    const targetLicence = dto.licence_number ?? existing.licenceNumber;
    if (['nurse', 'doctor'].includes(targetRole) && !targetLicence) {
      throw new HttpException(
        { statusCode: 422, error: 'LicenceRequired', message: 'Cédula obrigatória para este role' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const data: Prisma.UserUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.role !== undefined && { role: dto.role }),
      ...(dto.floors !== undefined && { floors: dto.floors }),
      ...(dto.licence_number !== undefined && { licenceNumber: dto.licence_number }),
    };
    const [updated] = await tenantBatch(this.prisma, actor.lar_id, [
      this.prisma.user.update({ where: { id }, data, select: ADMIN_SELECT }),
      this.prisma.auditLog.create({
        data: {
          larId: actor.lar_id,
          userId: actor.sub,
          action: 'user.updated',
          entityType: 'user',
          entityId: id,
          before: existing as unknown as Prisma.InputJsonValue,
          after: data as Prisma.InputJsonValue,
        },
      }),
    ]);
    return updated;
  }

  async setActive(actor: JwtPayload, id: string, active: boolean) {
    const db = forTenant(this.prisma, actor.lar_id);
    const existing = await db.user.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Worker não encontrado');

    await tenantBatch(this.prisma, actor.lar_id, [
      this.prisma.user.update({
        where: { id },
        data: { status: active ? 'active' : 'disabled' },
      }),
      this.prisma.auditLog.create({
        data: {
          larId: actor.lar_id,
          userId: actor.sub,
          action: active ? 'user.reactivated' : 'user.deactivated',
          entityType: 'user',
          entityId: id,
        },
      }),
    ]);
    if (!active) {
      // Desativação revoga TODAS as sessões — um worker desativado não pode
      // sobreviver num refresh token em cache (auth-security regra dura).
      await this.tokens.revokeAllForUser(id);
    }
  }
}
