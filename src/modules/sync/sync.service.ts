import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtPayload } from '../../common/auth/jwt-payload';
import { can, Permission } from '../../common/auth/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { forTenant } from '../../prisma/tenant';
import {
  ConfirmAdministrationDto,
  RefuseAdministrationDto,
} from '../clinical/emar/dto/administration.dto';
import { EmarService } from '../clinical/emar/emar.service';
import { CreateVitalDto } from '../clinical/vitals/dto/vital.dto';
import { VitalsService } from '../clinical/vitals/vitals.service';
import { SyncMutationDto, SyncMutationType } from './dto/sync.dto';

type ItemStatus = 'applied' | 'duplicate' | 'conflict' | 'error';

export interface SyncItemResult {
  client_id: string;
  type: SyncMutationType;
  status: ItemStatus;
  data?: unknown;
  /** Machine-readable code / conflict payload — never clinical content. */
  error?: unknown;
}

/** Base permission gate per mutation type (advanced/floor checks live in the services). */
const REQUIRED_PERMISSION: Record<SyncMutationType, Permission> = {
  'vital.create': 'vitals.record_basic',
  'administration.confirm': 'emar.administer',
  'administration.refuse': 'emar.refuse',
};

/**
 * Sync batch ingestion (#7). Composes the EXPORTED clinical services (no
 * deep-import of their logic). Each item is processed sequentially, in order,
 * in its own try/catch — one failure never aborts the batch (item-level
 * isolation, clinical hard rule 8). Idempotency: a pre-check on the per-tenant
 * client_id plus the DB partial-unique (lar_id, client_id) constraint as the
 * real backstop → replay = no-op duplicate.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emar: EmarService,
    private readonly vitals: VitalsService,
  ) {}

  async batch(actor: JwtPayload, mutations: SyncMutationDto[]): Promise<SyncItemResult[]> {
    const results: SyncItemResult[] = [];
    for (const m of mutations) {
      results.push(await this.processItem(actor, m));
    }
    return results;
  }

  private async processItem(actor: JwtPayload, m: SyncMutationDto): Promise<SyncItemResult> {
    const base = { client_id: m.client_id, type: m.type };
    // Per-item authz — the single route can't use @Require (clinical hard rule 9).
    if (!can(actor, REQUIRED_PERMISSION[m.type])) {
      return { ...base, status: 'error', error: { code: 'FORBIDDEN' } };
    }
    // Idempotency pre-check (the DB partial-unique is the backstop).
    const existingId = await this.findDuplicate(actor, m.type, m.client_id);
    if (existingId) return { ...base, status: 'duplicate', data: { id: existingId } };

    try {
      const data = await this.dispatch(actor, m);
      return { ...base, status: 'applied', data };
    } catch (e) {
      return this.mapError(base, e);
    }
  }

  /** Existing row id for this tenant + client_id, or null. */
  private async findDuplicate(
    actor: JwtPayload,
    type: SyncMutationType,
    clientId: string,
  ): Promise<string | null> {
    const db = forTenant(this.prisma, actor.lar_id);
    if (type === 'vital.create') {
      const r = await db.vitalReading.findFirst({
        where: { larId: actor.lar_id, clientId },
        select: { id: true },
      });
      return r?.id ?? null;
    }
    const r = await db.medicationAdministration.findFirst({
      where: { larId: actor.lar_id, clientId },
      select: { id: true },
    });
    return r?.id ?? null;
  }

  private dispatch(actor: JwtPayload, m: SyncMutationDto): Promise<unknown> {
    const p = m.payload;
    switch (m.type) {
      case 'vital.create': {
        const dto = { ...p, client_id: m.client_id } as unknown as CreateVitalDto;
        return this.vitals.create(actor, this.requireId(p.resident_id), dto);
      }
      case 'administration.confirm': {
        const dto = {
          notes: p.notes,
          administered_at: p.administered_at,
          client_id: m.client_id,
        } as unknown as ConfirmAdministrationDto;
        return this.emar.confirm(actor, this.requireId(p.administration_id), dto);
      }
      case 'administration.refuse': {
        const dto = {
          reason: p.reason,
          notes: p.notes,
          client_id: m.client_id,
        } as unknown as RefuseAdministrationDto;
        return this.emar.refuse(actor, this.requireId(p.administration_id), dto);
      }
    }
  }

  /** A missing target id is a payload problem → VALIDATION (not an opaque INTERNAL). */
  private requireId(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new UnprocessableEntityException('id-alvo em falta no payload');
    }
    return value;
  }

  private mapError(
    base: { client_id: string; type: SyncMutationType },
    e: unknown,
  ): SyncItemResult {
    // Invalid lifecycle transition / double-administration → conflict (carries
    // {confirmed_by,confirmed_at} or {currentStatus,requestedStatus}).
    if (e instanceof ConflictException) {
      return { ...base, status: 'conflict', error: e.getResponse() };
    }
    // Race on the unique key after the pre-check → still a duplicate.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ...base, status: 'duplicate' };
    }
    if (e instanceof ForbiddenException)
      return { ...base, status: 'error', error: { code: 'FORBIDDEN' } };
    if (e instanceof NotFoundException)
      return { ...base, status: 'error', error: { code: 'NOT_FOUND' } };
    if (e instanceof UnprocessableEntityException) {
      return { ...base, status: 'error', error: { code: 'VALIDATION' } };
    }
    // Unexpected — never let one item abort the batch. Log IDs only, no clinical data.
    this.logger.error(`Sync item failed: type=${base.type} client_id=${base.client_id}`);
    return { ...base, status: 'error', error: { code: 'INTERNAL' } };
  }
}
