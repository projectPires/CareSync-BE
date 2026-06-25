import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, WoundEvolution, WoundRecord } from '@prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { JwtPayload } from '../../../common/auth/jwt-payload';
import { can } from '../../../common/auth/permissions';
import { PrismaService } from '../../../prisma/prisma.service';
import { forTenant, tenantBatch } from '../../../prisma/tenant';
import { ResidentScopeService } from '../resident-scope.service';
import { CreateWoundDto, CreateWoundEvolutionDto } from './dto/wound.dto';
import {
  assertValidDressing,
  assertValidGrade,
  assertValidZone,
  SEVERE_GRADE,
} from './wound-staging';
import { WOUND_EVENTS } from './wounds.events';
import { toWoundEvolutionResponse, toWoundResponse } from './wounds.serializer';

@Injectable()
export class WoundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly scope: ResidentScopeService,
  ) {}

  /** Grade >= SEVERE_GRADE (3) requires wound.stage_severe — caps delegated aides at 1–2 (matrix §8). */
  private assertCanStage(actor: JwtPayload, grade: number): void {
    if (grade >= SEVERE_GRADE && !can(actor, 'wound.stage_severe')) {
      throw new ForbiddenException('grau ≥3 / estadiamento exige enfermeiro, médico ou admin');
    }
  }

  async createWound(actor: JwtPayload, residentId: string, dto: CreateWoundDto) {
    await this.scope.assertResidentInScope(actor, residentId);
    assertValidZone(dto.location);
    assertValidGrade(dto.grade, 1);
    this.assertCanStage(actor, dto.grade);

    const data: Prisma.WoundRecordUncheckedCreateInput = {
      larId: actor.lar_id,
      residentId,
      location: dto.location,
      kind: dto.kind ?? null,
      grade: dto.grade,
      status: 'open',
      createdBy: actor.sub,
    };
    const [created] = (await tenantBatch(this.prisma, actor.lar_id, [
      this.prisma.woundRecord.create({ data }),
      this.audit.op({
        larId: actor.lar_id,
        userId: actor.sub,
        action: 'wound.created',
        entityType: 'wound_record',
        after: { location: dto.location, grade: dto.grade },
      }),
    ])) as [WoundRecord, unknown];
    return toWoundResponse(created);
  }

  async listWounds(actor: JwtPayload, residentId: string) {
    await this.scope.assertResidentInScope(actor, residentId);
    const rows = await forTenant(this.prisma, actor.lar_id).woundRecord.findMany({
      where: { residentId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toWoundResponse);
  }

  private async findWound(
    actor: JwtPayload,
    residentId: string,
    woundId: string,
  ): Promise<WoundRecord> {
    const w = await forTenant(this.prisma, actor.lar_id).woundRecord.findUnique({
      where: { id: woundId },
    });
    // 404 (não revelar) se inexistente ou de outro residente.
    if (!w || w.residentId !== residentId) throw new NotFoundException('Ferida não encontrada');
    return w;
  }

  async addEvolution(
    actor: JwtPayload,
    residentId: string,
    woundId: string,
    dto: CreateWoundEvolutionDto,
  ) {
    await this.scope.assertResidentInScope(actor, residentId);
    const wound = await this.findWound(actor, residentId, woundId);
    assertValidGrade(dto.grade, 0);
    assertValidDressing(dto.dressing);
    this.assertCanStage(actor, dto.grade);

    let supersedesId: string | null = null;
    let reason: string | null = null;
    if (dto.supersedes_id) {
      // Correction = new row + reason; original stays (clinical hard rule 1).
      reason = dto.reason?.trim() ?? '';
      if (!reason) throw new UnprocessableEntityException('reason é obrigatório numa correção');
      const prev = await forTenant(this.prisma, actor.lar_id).woundEvolution.findUnique({
        where: { id: dto.supersedes_id },
      });
      if (!prev || prev.woundId !== woundId) {
        throw new NotFoundException('Evolução a corrigir não encontrada');
      }
      supersedesId = prev.id;
    }

    const evoData: Prisma.WoundEvolutionUncheckedCreateInput = {
      larId: actor.lar_id,
      woundId,
      grade: dto.grade,
      size: dto.size ?? null,
      dressing: dto.dressing ?? null,
      trend: null,
      photoKey: dto.photo_key ?? null,
      notes: dto.notes ?? null,
      recordedBy: actor.sub,
      supersedesId,
      reason,
      clientId: dto.client_id ?? null,
    };
    // WoundRecord is the MUTABLE identity — reflect latest grade + optional status.
    const woundUpdate: Prisma.WoundRecordUpdateInput = {
      grade: dto.grade,
      ...(dto.status && { status: dto.status }),
    };

    let created: WoundEvolution;
    try {
      [created] = (await tenantBatch(this.prisma, actor.lar_id, [
        this.prisma.woundEvolution.create({ data: evoData }),
        this.prisma.woundRecord.update({ where: { id: woundId }, data: woundUpdate }),
        this.audit.op({
          larId: actor.lar_id,
          userId: actor.sub,
          action: 'wound.evolution_added',
          entityType: 'wound_evolution',
          after: { woundId, grade: dto.grade, supersedesId },
        }),
      ])) as [WoundEvolution, unknown, unknown];
    } catch (e) {
      // Sync replay (clinical hard rule 8): same client_id → no-op, return existing.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        dto.client_id
      ) {
        const existing = await forTenant(this.prisma, actor.lar_id).woundEvolution.findFirst({
          where: { larId: actor.lar_id, clientId: dto.client_id },
        });
        if (existing) return toWoundEvolutionResponse(existing);
      }
      throw e;
    }

    // Deterioration: a higher grade than the wound carried before this evolution.
    if (wound.grade != null && dto.grade > wound.grade) {
      this.events.emit(WOUND_EVENTS.deteriorated, {
        larId: actor.lar_id,
        residentId,
        woundId,
        fromGrade: wound.grade,
        toGrade: dto.grade,
        createdAt: created.createdAt,
      });
    }
    return toWoundEvolutionResponse(created);
  }

  async listEvolutions(actor: JwtPayload, residentId: string, woundId: string) {
    await this.scope.assertResidentInScope(actor, residentId);
    await this.findWound(actor, residentId, woundId); // 404 if wound not in scope
    const rows = await forTenant(this.prisma, actor.lar_id).woundEvolution.findMany({
      where: { woundId },
      orderBy: { createdAt: 'desc' },
    });
    // Current entries only — drop any superseded by a correction.
    const superseded = new Set(rows.map((r) => r.supersedesId).filter(Boolean));
    return rows.filter((r) => !superseded.has(r.id)).map(toWoundEvolutionResponse);
  }
}
