import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtPayload } from '../../common/auth/jwt-payload';
import { PrismaService } from '../../prisma/prisma.service';
import { forTenant, tenantBatch } from '../../prisma/tenant';
import { UpdateLarDto } from './dto/lar.dto';

@Injectable()
export class LaresService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwn(actor: JwtPayload) {
    const lar = await forTenant(this.prisma, actor.lar_id).lar.findUnique({
      where: { id: actor.lar_id },
    });
    if (!lar) throw new NotFoundException('Lar não encontrado');
    return lar;
  }

  async updateOwn(actor: JwtPayload, dto: UpdateLarDto) {
    const before = await this.getOwn(actor);
    const data: Prisma.LarUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.legal_name !== undefined && { legalName: dto.legal_name }),
      ...(dto.address !== undefined && { address: dto.address as Prisma.InputJsonValue }),
      ...(dto.floors !== undefined && { floors: dto.floors }),
      ...(dto.capacity !== undefined && { capacity: dto.capacity }),
      ...(dto.config !== undefined && { config: dto.config as Prisma.InputJsonValue }),
    };
    const [updated] = await tenantBatch(this.prisma, actor.lar_id, [
      this.prisma.lar.update({ where: { id: actor.lar_id }, data }),
      this.prisma.auditLog.create({
        data: {
          larId: actor.lar_id,
          userId: actor.sub,
          action: 'lar.updated',
          entityType: 'lar',
          entityId: actor.lar_id,
          before: before as unknown as Prisma.InputJsonValue,
          after: data as Prisma.InputJsonValue,
        },
      }),
    ]);
    return updated;
  }
}
