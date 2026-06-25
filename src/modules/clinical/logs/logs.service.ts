import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LogCategory, LogEntry, Prisma } from '@prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { JwtPayload } from '../../../common/auth/jwt-payload';
import { can, Permission } from '../../../common/auth/permissions';
import { PrismaService } from '../../../prisma/prisma.service';
import { forTenant, tenantBatch } from '../../../prisma/tenant';
import { ResidentScopeService } from '../resident-scope.service';
import { CreateLogDto } from './dto/log.dto';
import { validateLogEntry } from './log-categories';
import { LOG_EVENTS } from './logs.events';
import { toLogResponse } from './logs.serializer';

const DEFAULT_WINDOW_MS = 7 * 24 * 3600_000;
const CATEGORIES: readonly LogCategory[] = ['medical', 'nutrition', 'hygiene', 'social'];

/** Write authority per category (matrix §8): médico é read-only nos cuidados. */
const WRITE_PERMISSION: Record<LogCategory, Permission> = {
  medical: 'log.write_medical',
  nutrition: 'log.write_care',
  hygiene: 'log.write_care',
  social: 'log.write_care',
};

interface ListQuery {
  category?: string;
  kind?: string;
  flagged?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class LogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly scope: ResidentScopeService,
  ) {}

  async create(actor: JwtPayload, residentId: string, dto: CreateLogDto) {
    await this.scope.assertResidentInScope(actor, residentId);

    // Category-specific kind/value validation (422) BEFORE any side effect.
    validateLogEntry(dto.category, dto.kind, dto.value ?? null);

    // Write authority depends on the category (matrix §8 — médico read-only em cuidados).
    if (!can(actor, WRITE_PERMISSION[dto.category])) {
      throw new ForbiddenException(`Sem permissão para registar em ${dto.category}`);
    }

    let supersedesId: string | null = null;
    let reason: string | null = null;
    if (dto.supersedes_id) {
      // Correction = new entry + reason; original stays (clinical hard rule 1).
      reason = dto.reason?.trim() ?? '';
      if (!reason) throw new UnprocessableEntityException('reason é obrigatório numa correção');
      const prev = await forTenant(this.prisma, actor.lar_id).logEntry.findUnique({
        where: { id: dto.supersedes_id },
      });
      if (!prev || prev.residentId !== residentId || prev.category !== dto.category) {
        throw new NotFoundException('Registo a corrigir não encontrado');
      }
      supersedesId = prev.id;
    }

    const data: Prisma.LogEntryUncheckedCreateInput = {
      larId: actor.lar_id,
      residentId,
      category: dto.category,
      kind: dto.kind,
      title: dto.title,
      value: dto.value ?? null,
      notes: dto.notes ?? null,
      authorId: actor.sub,
      flagged: dto.flagged ?? false,
      clientId: dto.client_id ?? null,
      supersedesId,
      reason,
    };

    let created: LogEntry;
    try {
      [created] = (await tenantBatch(this.prisma, actor.lar_id, [
        this.prisma.logEntry.create({ data }),
        this.audit.op({
          larId: actor.lar_id,
          userId: actor.sub,
          action: supersedesId ? 'log.corrected' : 'log.created',
          entityType: 'log_entry',
          after: { category: dto.category, kind: dto.kind, flagged: data.flagged, supersedesId },
        }),
      ])) as [LogEntry, unknown];
    } catch (e) {
      // Sync replay (clinical hard rule 8): same client_id → no-op, return existing.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        dto.client_id
      ) {
        const existing = await forTenant(this.prisma, actor.lar_id).logEntry.findFirst({
          where: { larId: actor.lar_id, clientId: dto.client_id },
        });
        if (existing) return toLogResponse(existing);
      }
      throw e;
    }

    if (created.flagged) {
      this.events.emit(LOG_EVENTS.flagged, {
        larId: actor.lar_id,
        residentId,
        logEntryId: created.id,
        category: created.category,
        createdAt: created.createdAt,
      });
    }
    return toLogResponse(created);
  }

  async list(actor: JwtPayload, residentId: string, q: ListQuery) {
    await this.scope.assertResidentInScope(actor, residentId);

    if (q.category && !CATEGORIES.includes(q.category as LogCategory)) {
      throw new BadRequestException('categoria inválida');
    }

    const now = new Date();
    const to = q.to ? new Date(q.to) : now;
    const from = q.from ? new Date(q.from) : new Date(now.getTime() - DEFAULT_WINDOW_MS);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('from/to devem ser datas ISO 8601 válidas');
    }
    const flagged = q.flagged === 'true' ? true : q.flagged === 'false' ? false : undefined;

    const rows = await forTenant(this.prisma, actor.lar_id).logEntry.findMany({
      where: {
        residentId,
        ...(q.category && { category: q.category as LogCategory }),
        ...(q.kind && { kind: q.kind }),
        ...(flagged !== undefined && { flagged }),
        createdAt: { gte: from, lte: to },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Current entries only — drop any superseded by a correction.
    const superseded = new Set(rows.map((r) => r.supersedesId).filter(Boolean));
    return rows.filter((r) => !superseded.has(r.id)).map(toLogResponse);
  }
}
