import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtPayload } from '../../common/auth/jwt-payload';
import { can } from '../../common/auth/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { forTenant } from '../../prisma/tenant';

/**
 * Server-side floor scoping (clinical hard rule 7), shared by every clinical
 * sub-module (eMAR, vitals, logs, wounds, …) so the rule lives in ONE place
 * instead of being copy-pasted per service.
 *
 * Out-of-scope residents return 404, never 403 — não revelar a existência de um
 * residente noutro piso. Holders of `resident.read_all_floors` (admin/doctor)
 * bypass the floor filter.
 */
@Injectable()
export class ResidentScopeService {
  constructor(private readonly prisma: PrismaService) {}

  private async actorFloors(actor: JwtPayload): Promise<number[]> {
    const me = await forTenant(this.prisma, actor.lar_id).user.findUnique({
      where: { id: actor.sub },
      select: { floors: true },
    });
    return me?.floors ?? [];
  }

  async assertResidentInScope(actor: JwtPayload, residentId: string): Promise<void> {
    if (can(actor, 'resident.read_all_floors')) {
      const exists = await forTenant(this.prisma, actor.lar_id).resident.findUnique({
        where: { id: residentId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Residente não encontrado');
      return;
    }
    const floors = await this.actorFloors(actor);
    const scoped = await forTenant(this.prisma, actor.lar_id).resident.findFirst({
      where: { id: residentId, floor: { in: floors } },
      select: { id: true },
    });
    if (!scoped) throw new NotFoundException('Residente não encontrado');
  }
}
