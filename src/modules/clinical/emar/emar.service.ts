import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AdministrationStatus, Medication, MedicationAdministration, Prisma } from '@prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { JwtPayload } from '../../../common/auth/jwt-payload';
import { can } from '../../../common/auth/permissions';
import { PrismaService } from '../../../prisma/prisma.service';
import { forTenant, tenantBatch } from '../../../prisma/tenant';
import { assertValidTransition } from './administration-state-machine';
import { ConfirmAdministrationDto, RefuseAdministrationDto } from './dto/administration.dto';
import {
  CreateMedicationDto,
  DiscontinueMedicationDto,
  UpdateMedicationDto,
} from './dto/medication.dto';
import { AdministrationTransitionEvent, EMAR_EVENTS } from './emar.events';
import { toAdministrationResponse, toMedicationResponse } from './emar.serializer';
import { expandSchedule, MedicationSchedule, startOfDayInZone } from './medication-schedule';

/** How far ahead the scheduler materialises pending administrations. */
export const MATERIALIZE_HORIZON_HOURS = 24;

interface CreatedSlot {
  id: string;
  medicationId: string;
  residentId: string;
  scheduledAt: Date;
}

@Injectable()
export class EmarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Floor scoping (clinical hard rule 7 — server-side) ─────────────────────

  private async actorFloors(actor: JwtPayload): Promise<number[]> {
    const me = await forTenant(this.prisma, actor.lar_id).user.findUnique({
      where: { id: actor.sub },
      select: { floors: true },
    });
    return me?.floors ?? [];
  }

  /** 404 (não 403) fora do piso — não revelar existência (regra clínica 7). */
  private async assertResidentInScope(actor: JwtPayload, residentId: string): Promise<void> {
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

  // ── Plan (Medication) — mutable, admin/doctor only (matrix) ────────────────

  async createPlan(actor: JwtPayload, residentId: string, dto: CreateMedicationDto) {
    await this.assertResidentInScope(actor, residentId);
    const data: Prisma.MedicationUncheckedCreateInput = {
      larId: actor.lar_id,
      residentId,
      drug: dto.drug,
      dci: dto.dci ?? null,
      dose: dto.dose,
      form: dto.form,
      route: dto.route,
      schedule: dto.schedule as unknown as Prisma.InputJsonValue,
      condition: dto.condition ?? null,
      prescribedBy: dto.prescribed_by ?? actor.sub,
      startDate: new Date(dto.start_date),
      endDate: dto.end_date ? new Date(dto.end_date) : null,
    };
    const [created] = (await tenantBatch(this.prisma, actor.lar_id, [
      this.prisma.medication.create({ data }),
      this.audit.op({
        larId: actor.lar_id,
        userId: actor.sub,
        action: 'medication.plan_created',
        entityType: 'medication',
        entityId: residentId,
        after: data,
      }),
    ])) as [Medication, unknown];
    return toMedicationResponse(created);
  }

  async listPlans(actor: JwtPayload, residentId: string, updatedSince?: Date) {
    await this.assertResidentInScope(actor, residentId);
    const rows = await forTenant(this.prisma, actor.lar_id).medication.findMany({
      where: {
        residentId,
        // Delta fetch (#9): só planos alterados desde o cursor do cliente.
        ...(updatedSince && { updatedAt: { gte: updatedSince } }),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toMedicationResponse);
  }

  private async findPlan(actor: JwtPayload, id: string, residentId?: string): Promise<Medication> {
    const plan = await forTenant(this.prisma, actor.lar_id).medication.findUnique({
      where: { id },
    });
    // 404 (não revelar) se inexistente OU se o plano não pertence ao residente da rota.
    if (!plan || (residentId && plan.residentId !== residentId)) {
      throw new NotFoundException('Plano de medicação não encontrado');
    }
    await this.assertResidentInScope(actor, plan.residentId);
    return plan;
  }

  async getPlan(actor: JwtPayload, residentId: string, id: string) {
    return toMedicationResponse(await this.findPlan(actor, id, residentId));
  }

  async updatePlan(actor: JwtPayload, residentId: string, id: string, dto: UpdateMedicationDto) {
    const before = await this.findPlan(actor, id, residentId);
    const data: Prisma.MedicationUpdateInput = {
      ...(dto.drug !== undefined && { drug: dto.drug }),
      ...(dto.dci !== undefined && { dci: dto.dci }),
      ...(dto.dose !== undefined && { dose: dto.dose }),
      ...(dto.form !== undefined && { form: dto.form }),
      ...(dto.route !== undefined && { route: dto.route }),
      ...(dto.schedule !== undefined && {
        schedule: dto.schedule as unknown as Prisma.InputJsonValue,
      }),
      ...(dto.condition !== undefined && { condition: dto.condition }),
      ...(dto.end_date !== undefined && { endDate: new Date(dto.end_date) }),
    };
    const [updated] = (await tenantBatch(this.prisma, actor.lar_id, [
      this.prisma.medication.update({ where: { id }, data }),
      this.audit.op({
        larId: actor.lar_id,
        userId: actor.sub,
        action: 'medication.plan_updated',
        entityType: 'medication',
        entityId: id,
        before,
        after: data,
      }),
    ])) as [Medication, unknown];
    return toMedicationResponse(updated);
  }

  /** Descontinuar = soft (define end_date). NUNCA DELETE físico (RGPD red line 4). */
  async discontinuePlan(
    actor: JwtPayload,
    residentId: string,
    id: string,
    dto: DiscontinueMedicationDto,
  ) {
    const before = await this.findPlan(actor, id, residentId);
    const data: Prisma.MedicationUpdateInput = { endDate: new Date() };
    const [updated] = (await tenantBatch(this.prisma, actor.lar_id, [
      this.prisma.medication.update({ where: { id }, data }),
      this.audit.op({
        larId: actor.lar_id,
        userId: actor.sub,
        action: 'medication.plan_discontinued',
        entityType: 'medication',
        entityId: id,
        before,
        after: { endDate: data.endDate, reason: dto.reason ?? null },
      }),
    ])) as [Medication, unknown];
    return toMedicationResponse(updated);
  }

  // ── Administrations — append-only event log ────────────────────────────────

  /** Latest row (current state) for the slot a given administration belongs to. */
  private async currentRow(
    actor: JwtPayload,
    administrationId: string,
  ): Promise<{ target: MedicationAdministration; current: MedicationAdministration }> {
    const db = forTenant(this.prisma, actor.lar_id);
    const target = await db.medicationAdministration.findUnique({
      where: { id: administrationId },
      include: { resident: { select: { floor: true } } },
    });
    if (!target) throw new NotFoundException('Administração não encontrada');
    await this.assertResidentInScope(actor, target.residentId);
    const current = await db.medicationAdministration.findFirst({
      where: { medicationId: target.medicationId, scheduledAt: target.scheduledAt },
      orderBy: { createdAt: 'desc' },
    });
    // `current` is non-null (target itself qualifies) but keep TS happy.
    return { target, current: current ?? target };
  }

  private alreadyConfirmed(taken: MedicationAdministration): ConflictException {
    // "já confirmada por X" — the mobile modal payload (clinical hard rule 2).
    // Under `details` so AllExceptionsFilter preserves it in the response body.
    return new ConflictException({
      message: 'Administração já confirmada',
      details: { confirmed_by: taken.administeredBy, confirmed_at: taken.administeredAt },
    });
  }

  async confirm(actor: JwtPayload, administrationId: string, dto: ConfirmAdministrationDto) {
    const { target, current } = await this.currentRow(actor, administrationId);
    if (current.status === 'taken') throw this.alreadyConfirmed(current);
    assertValidTransition(current.status, 'taken');

    const data: Prisma.MedicationAdministrationUncheckedCreateInput = {
      larId: actor.lar_id,
      medicationId: target.medicationId,
      residentId: target.residentId,
      scheduledAt: target.scheduledAt,
      status: 'taken',
      administeredBy: actor.sub,
      // Offline: real administration time may precede sync (server createdAt still orders).
      administeredAt: dto.administered_at ? new Date(dto.administered_at) : new Date(),
      supersedesId: current.id,
      notes: dto.notes ?? null,
      clientId: dto.client_id ?? null,
    };
    try {
      const [created] = (await tenantBatch(this.prisma, actor.lar_id, [
        this.prisma.medicationAdministration.create({ data }),
        this.audit.op({
          larId: actor.lar_id,
          userId: actor.sub,
          action: 'medication.administered',
          entityType: 'medication_administration',
          entityId: target.medicationId,
          after: { status: 'taken', scheduledAt: target.scheduledAt, supersedesId: current.id },
        }),
      ])) as [MedicationAdministration, unknown];
      return toAdministrationResponse(created);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Sync replay (same client_id) → idempotent no-op: return the existing row.
        if (dto.client_id) {
          const dup = await forTenant(this.prisma, actor.lar_id).medicationAdministration.findFirst(
            { where: { larId: actor.lar_id, clientId: dto.client_id } },
          );
          if (dup) return toAdministrationResponse(dup);
        }
        // Otherwise a different action lost the taken_once race → "já confirmada".
        const taken = await forTenant(this.prisma, actor.lar_id).medicationAdministration.findFirst(
          {
            where: {
              medicationId: target.medicationId,
              scheduledAt: target.scheduledAt,
              status: 'taken',
            },
          },
        );
        if (taken) throw this.alreadyConfirmed(taken);
      }
      throw e;
    }
  }

  async refuse(actor: JwtPayload, administrationId: string, dto: RefuseAdministrationDto) {
    const reason = dto.reason?.trim();
    if (!reason) {
      // Clinical hard rule 4 — recusa exige motivo. 422 (não 400).
      throw new UnprocessableEntityException('reason é obrigatório (recusa exige motivo)');
    }
    const { target, current } = await this.currentRow(actor, administrationId);
    assertValidTransition(current.status, 'refused');

    const data: Prisma.MedicationAdministrationUncheckedCreateInput = {
      larId: actor.lar_id,
      medicationId: target.medicationId,
      residentId: target.residentId,
      scheduledAt: target.scheduledAt,
      status: 'refused',
      reason,
      supersedesId: current.id,
      notes: dto.notes ?? null,
      clientId: dto.client_id ?? null,
    };
    try {
      const [created] = (await tenantBatch(this.prisma, actor.lar_id, [
        this.prisma.medicationAdministration.create({ data }),
        this.audit.op({
          larId: actor.lar_id,
          userId: actor.sub,
          action: 'medication.refused',
          entityType: 'medication_administration',
          entityId: target.medicationId,
          after: { status: 'refused', scheduledAt: target.scheduledAt, supersedesId: current.id },
        }),
      ])) as [MedicationAdministration, unknown];
      return toAdministrationResponse(created);
    } catch (e) {
      // Sync replay (same client_id) → idempotent no-op.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        dto.client_id
      ) {
        const dup = await forTenant(this.prisma, actor.lar_id).medicationAdministration.findFirst({
          where: { larId: actor.lar_id, clientId: dto.client_id },
        });
        if (dup) return toAdministrationResponse(dup);
      }
      throw e;
    }
  }

  /** eMAR list — current state per slot in a window. Aide capped to today. */
  async listAdministrations(actor: JwtPayload, residentId: string, dateParam?: string) {
    await this.assertResidentInScope(actor, residentId);
    // Matrix: auxiliar vê só hoje — ignora pedido de outro dia sem emar.read_history.
    const requested = dateParam && can(actor, 'emar.read_history') ? dateParam : undefined;
    // "Hoje"/data = dia civil de Lisboa (não UTC) — apanha tomas perto da meia-noite local.
    const anchor = requested ? new Date(`${requested}T12:00:00.000Z`) : new Date();
    const from = startOfDayInZone(anchor);
    // +26h aterra sempre no dia civil seguinte (máx. dia DST = 25h); início desse dia.
    const to = startOfDayInZone(new Date(from.getTime() + 26 * 3600_000));

    const rows = await forTenant(this.prisma, actor.lar_id).medicationAdministration.findMany({
      where: { residentId, scheduledAt: { gte: from, lt: to } },
      orderBy: { createdAt: 'asc' },
    });
    // Collapse the append-only chain to the latest row per (medication, slot).
    const latest = new Map<string, MedicationAdministration>();
    for (const r of rows) latest.set(`${r.medicationId}|${r.scheduledAt.toISOString()}`, r);
    return [...latest.values()]
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .map(toAdministrationResponse);
  }

  // ── Scheduler / jobs surface (system paths — no HTTP tenant context) ───────

  /**
   * Materialise `pending` administrations for one Lar over the horizon.
   * Idempotent: INSERT ... ON CONFLICT DO NOTHING against the pending_once
   * partial index. Returns only the rows actually created (for delayed-job
   * enqueue). Runs in one tenant-scoped transaction (RLS + audit, rule 5).
   */
  async materializePending(larId: string): Promise<CreatedSlot[]> {
    const db = forTenant(this.prisma, larId);
    const now = new Date();
    const horizon = new Date(now.getTime() + MATERIALIZE_HORIZON_HOURS * 3600_000);

    const meds = await db.medication.findMany({
      where: {
        startDate: { lte: horizon },
        OR: [{ endDate: null }, { endDate: { gte: startOfUtcDay(now) } }],
        resident: { archivedAt: null },
      },
      select: { id: true, residentId: true, schedule: true },
    });

    const slots: Omit<CreatedSlot, 'id'>[] = [];
    for (const m of meds) {
      for (const at of expandSchedule(m.schedule as unknown as MedicationSchedule, now, horizon)) {
        slots.push({ medicationId: m.id, residentId: m.residentId, scheduledAt: at });
      }
    }
    if (slots.length === 0) return [];

    const created: CreatedSlot[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_lar_id', ${larId}, TRUE)`;
      for (const s of slots) {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO medication_administration
            (id, lar_id, medication_id, resident_id, scheduled_at, status, created_at)
          VALUES
            (gen_random_uuid(), ${larId}::uuid, ${s.medicationId}::uuid, ${s.residentId}::uuid,
             ${s.scheduledAt}, 'pending', now())
          ON CONFLICT (medication_id, scheduled_at) WHERE status = 'pending' DO NOTHING
          RETURNING id`;
        if (rows.length > 0) created.push({ ...s, id: rows[0].id });
      }
      if (created.length > 0) {
        await tx.auditLog.create({
          data: {
            larId,
            action: 'medication.scheduled',
            entityType: 'medication_administration',
            after: { count: created.length },
          },
        });
      }
    });
    return created;
  }

  /**
   * Automatic transition (pending→delayed, delayed→missed) driven by BullMQ.
   * Locks the current-state row FOR UPDATE and SKIPS (returns false) if the
   * slot has moved on (already taken/refused or not in the expected source
   * state) — never forks the chain (clinical-safety ruling 4). Emits the domain
   * event on success.
   */
  async transition(
    larId: string,
    administrationId: string,
    to: Extract<AdministrationStatus, 'delayed' | 'missed'>,
  ): Promise<boolean> {
    const expectedFrom: AdministrationStatus = to === 'delayed' ? 'pending' : 'delayed';

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_lar_id', ${larId}, TRUE)`;
      const target = await tx.medicationAdministration.findUnique({
        where: { id: administrationId },
        select: { medicationId: true, scheduledAt: true, residentId: true },
      });
      if (!target) return null;
      const locked = await tx.$queryRaw<{ id: string; status: AdministrationStatus }[]>`
        SELECT id, status FROM medication_administration
        WHERE medication_id = ${target.medicationId}::uuid AND scheduled_at = ${target.scheduledAt}
        ORDER BY created_at DESC LIMIT 1
        FOR UPDATE`;
      const current = locked[0];
      if (!current || current.status !== expectedFrom) return null;

      await tx.medicationAdministration.create({
        data: {
          larId,
          medicationId: target.medicationId,
          residentId: target.residentId,
          scheduledAt: target.scheduledAt,
          status: to,
          supersedesId: current.id,
        },
      });
      await tx.auditLog.create({
        data: {
          larId,
          action: `medication.${to}`,
          entityType: 'medication_administration',
          entityId: current.id,
          after: { status: to, supersedesId: current.id },
        },
      });
      return target;
    });

    if (!result) return false;
    const payload: AdministrationTransitionEvent = {
      larId,
      administrationId,
      residentId: result.residentId,
      medicationId: result.medicationId,
      scheduledAt: result.scheduledAt,
    };
    this.events.emit(EMAR_EVENTS[to], payload);
    return true;
  }
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
