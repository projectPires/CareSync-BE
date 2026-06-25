import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, VitalMetric, VitalReading } from '@prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { JwtPayload } from '../../../common/auth/jwt-payload';
import { can } from '../../../common/auth/permissions';
import { PrismaService } from '../../../prisma/prisma.service';
import { forTenant, tenantBatch } from '../../../prisma/tenant';
import { ResidentScopeService } from '../resident-scope.service';
import { CreateVitalDto } from './dto/vital.dto';
import { isAbnormal, validateVitalValue } from './vital-metrics';
import { VITALS_EVENTS } from './vitals.events';
import { toVitalResponse } from './vitals.serializer';

/** SpO₂ / Glicemia / Dor — aide needs vitals.record_advanced delegated (🔒). */
const ADVANCED_METRICS: ReadonlySet<VitalMetric> = new Set(['spo2', 'glucose', 'pain']);
const METRICS: readonly VitalMetric[] = ['bp', 'hr', 'spo2', 'temp', 'glucose', 'pain'];
const DEFAULT_WINDOW_MS = 7 * 24 * 3600_000;
const AIDE_WINDOW_MS = 24 * 3600_000;

interface HistoryQuery {
  metric?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class VitalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    // Floor scoping (clinical hard rule 7) is shared across clinical modules.
    private readonly scope: ResidentScopeService,
  ) {}

  // ── Record (append-only) ───────────────────────────────────────────────────

  async create(actor: JwtPayload, residentId: string, dto: CreateVitalDto) {
    await this.scope.assertResidentInScope(actor, residentId);

    // Shape per metric (422 on bad shape) BEFORE any side effect.
    const parsed = validateVitalValue(dto.metric, dto.value);

    // 🔒 advanced metrics require delegated permission for aides.
    if (ADVANCED_METRICS.has(dto.metric) && !can(actor, 'vitals.record_advanced')) {
      throw new ForbiddenException(`Sem permissão para registar ${dto.metric}`);
    }

    let supersedesId: string | null = null;
    let reason: string | null = null;
    if (dto.supersedes_id) {
      // Correction = new reading + reason; original stays (clinical hard rule 1).
      reason = dto.reason?.trim() ?? '';
      if (!reason) throw new UnprocessableEntityException('reason é obrigatório numa correção');
      const prev = await forTenant(this.prisma, actor.lar_id).vitalReading.findUnique({
        where: { id: dto.supersedes_id },
      });
      if (!prev || prev.residentId !== residentId || prev.metric !== dto.metric) {
        throw new NotFoundException('Leitura a corrigir não encontrada');
      }
      supersedesId = prev.id;
    }

    const abnormal = isAbnormal(dto.metric, parsed);
    const data: Prisma.VitalReadingUncheckedCreateInput = {
      larId: actor.lar_id,
      residentId,
      metric: dto.metric,
      value: dto.value as Prisma.InputJsonValue,
      abnormal,
      recordedAt: dto.recorded_at ? new Date(dto.recorded_at) : new Date(),
      recordedBy: actor.sub,
      notes: dto.notes ?? null,
      clientId: dto.client_id ?? null,
      supersedesId,
      reason,
    };
    let created: VitalReading;
    try {
      [created] = (await tenantBatch(this.prisma, actor.lar_id, [
        this.prisma.vitalReading.create({ data }),
        this.audit.op({
          larId: actor.lar_id,
          userId: actor.sub,
          action: 'vital.recorded',
          entityType: 'vital_reading',
          after: { metric: dto.metric, abnormal, supersedesId },
        }),
      ])) as [VitalReading, unknown];
    } catch (e) {
      // Sync replay (clinical hard rule 8): same client_id → no-op, return existing.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        dto.client_id
      ) {
        // client_id is unique per (lar_id, client_id) — scope the lookup to the tenant.
        const existing = await forTenant(this.prisma, actor.lar_id).vitalReading.findFirst({
          where: { larId: actor.lar_id, clientId: dto.client_id },
        });
        if (existing) return toVitalResponse(existing);
      }
      throw e;
    }

    if (abnormal) {
      this.events.emit(VITALS_EVENTS.abnormal, {
        larId: actor.lar_id,
        residentId,
        vitalReadingId: created.id,
        metric: created.metric,
        recordedAt: created.recordedAt,
      });
    }
    return toVitalResponse(created);
  }

  // ── History ─────────────────────────────────────────────────────────────────

  async history(actor: JwtPayload, residentId: string, q: HistoryQuery) {
    await this.scope.assertResidentInScope(actor, residentId);
    if (q.metric && !METRICS.includes(q.metric as VitalMetric)) {
      throw new BadRequestException('métrica inválida');
    }

    const now = new Date();
    const to = q.to ? new Date(q.to) : now;
    let from = q.from ? new Date(q.from) : new Date(now.getTime() - DEFAULT_WINDOW_MS);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('from/to devem ser datas ISO 8601 válidas');
    }
    // Matrix: auxiliar vê só 24h — cap server-side (cliente não controla).
    if (!can(actor, 'vitals.read_history')) {
      const cap = new Date(now.getTime() - AIDE_WINDOW_MS);
      if (from < cap) from = cap;
    }

    const rows = await forTenant(this.prisma, actor.lar_id).vitalReading.findMany({
      where: {
        residentId,
        ...(q.metric && { metric: q.metric as VitalMetric }),
        recordedAt: { gte: from, lte: to },
      },
      orderBy: { recordedAt: 'desc' },
    });
    // Current readings only — drop any reading superseded by a correction.
    const superseded = new Set(rows.map((r) => r.supersedesId).filter(Boolean));
    return rows.filter((r) => !superseded.has(r.id)).map(toVitalResponse);
  }
}
