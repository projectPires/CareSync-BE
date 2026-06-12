import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Resident } from '@prisma/client';
import { JwtPayload } from '../../common/auth/jwt-payload';
import { can } from '../../common/auth/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { forTenant, tenantBatch } from '../../prisma/tenant';
import {
  ArchiveResidentDto,
  CreateResidentDto,
  UpdateDnrDto,
  UpdateResidentAdminDto,
  UpdateResidentClinicalDto,
} from './dto/resident.dto';
import { toResidentResponse } from './resident.serializer';

interface ListFilters {
  floor?: number;
  status?: Resident['status'];
  include_archived?: boolean;
}

@Injectable()
export class ResidentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scoping de piso é SERVER-SIDE (regra clínica 7): quem não tem
   * resident.read_all_floors só vê os residentes dos seus pisos — o filtro do
   * cliente é UX, este é o que conta.
   */
  private floorScope(actor: JwtPayload, actorFloors: number[]): Prisma.ResidentWhereInput {
    if (can(actor, 'resident.read_all_floors')) return {};
    return { floor: { in: actorFloors } };
  }

  private async actorFloors(actor: JwtPayload): Promise<number[]> {
    const me = await forTenant(this.prisma, actor.lar_id).user.findUnique({
      where: { id: actor.sub },
      select: { floors: true },
    });
    return me?.floors ?? [];
  }

  async list(actor: JwtPayload, filters: ListFilters) {
    const floors = await this.actorFloors(actor);
    const includeArchived = filters.include_archived === true && actor.role === 'admin';
    const rows = await forTenant(this.prisma, actor.lar_id).resident.findMany({
      where: {
        ...this.floorScope(actor, floors),
        ...(filters.floor !== undefined && { floor: filters.floor }),
        ...(filters.status && { status: filters.status }),
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ floor: 'asc' }, { room: 'asc' }],
    });
    return rows.map(toResidentResponse);
  }

  async getById(actor: JwtPayload, id: string) {
    const resident = await this.findScoped(actor, id);
    return toResidentResponse(resident);
  }

  /** 404 (não 403) fora do piso — não revelar existência. */
  private async findScoped(actor: JwtPayload, id: string): Promise<Resident> {
    const floors = await this.actorFloors(actor);
    const resident = await forTenant(this.prisma, actor.lar_id).resident.findFirst({
      where: { id, ...this.floorScope(actor, floors) },
    });
    if (!resident) throw new NotFoundException('Residente não encontrado');
    return resident;
  }

  async create(actor: JwtPayload, dto: CreateResidentDto) {
    const db = forTenant(this.prisma, actor.lar_id);
    const dup = await db.resident.findUnique({
      where: { larId_snsNumber: { larId: actor.lar_id, snsNumber: dto.sns_number } },
    });
    if (dup) throw new ConflictException('Já existe um residente com este número SNS neste Lar');
    // TODO(#25): verificação de seats da subscrição (ativos == contratados → 409)

    const data: Prisma.ResidentUncheckedCreateInput = {
      larId: actor.lar_id,
      name: dto.name,
      dateOfBirth: new Date(dto.date_of_birth),
      gender: dto.gender,
      snsNumber: dto.sns_number,
      nif: dto.nif ?? null,
      room: dto.room,
      floor: dto.floor,
      bloodType: dto.blood_type ?? 'unknown',
      allergies: dto.allergies ?? [],
      chronicConditions: dto.chronic_conditions ?? [],
      admittedAt: new Date(dto.admitted_at),
      emergencyContact: dto.emergency_contact as Prisma.InputJsonValue,
      assistantDoctor: (dto.assistant_doctor as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      rgpdConsent: dto.rgpd_consent ?? false,
      rgpdConsentAt: dto.rgpd_consent_at ? new Date(dto.rgpd_consent_at) : null,
    };
    const created = await db.resident.create({ data });
    await this.audit(actor, 'resident.created', created.id, null, data);
    return toResidentResponse(created);
  }

  async updateAdmin(actor: JwtPayload, id: string, dto: UpdateResidentAdminDto) {
    const before = await this.findScoped(actor, id);
    const data: Prisma.ResidentUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.sns_number !== undefined && { snsNumber: dto.sns_number }),
      ...(dto.nif !== undefined && { nif: dto.nif }),
      ...(dto.room !== undefined && { room: dto.room }),
      ...(dto.floor !== undefined && { floor: dto.floor }),
      ...(dto.emergency_contact !== undefined && {
        emergencyContact: dto.emergency_contact as Prisma.InputJsonValue,
      }),
      ...(dto.assistant_doctor !== undefined && {
        assistantDoctor: dto.assistant_doctor as Prisma.InputJsonValue,
      }),
      ...(dto.rgpd_consent !== undefined && { rgpdConsent: dto.rgpd_consent }),
      ...(dto.rgpd_consent_at !== undefined && { rgpdConsentAt: new Date(dto.rgpd_consent_at) }),
    };
    return this.applyUpdate(actor, id, before, data, 'resident.admin_updated');
  }

  async updateClinical(actor: JwtPayload, id: string, dto: UpdateResidentClinicalDto) {
    const before = await this.findScoped(actor, id);
    const data: Prisma.ResidentUpdateInput = {
      ...(dto.allergies !== undefined && { allergies: dto.allergies }),
      ...(dto.chronic_conditions !== undefined && { chronicConditions: dto.chronic_conditions }),
      ...(dto.blood_type !== undefined && { bloodType: dto.blood_type }),
      ...(dto.status !== undefined && { status: dto.status }),
    };
    return this.applyUpdate(actor, id, before, data, 'resident.clinical_updated');
  }

  async updateDnr(actor: JwtPayload, id: string, dto: UpdateDnrDto) {
    const before = await this.findScoped(actor, id);
    const data: Prisma.ResidentUpdateInput = {
      dnr: dto.dnr,
      dnrDocumentUrl: dto.dnr_document_url ?? null,
    };
    return this.applyUpdate(actor, id, before, data, 'resident.dnr_updated');
  }

  async archive(actor: JwtPayload, id: string, dto: ArchiveResidentDto) {
    const before = await this.findScoped(actor, id);
    if (before.archivedAt) throw new ConflictException('Residente já arquivado');
    const data: Prisma.ResidentUpdateInput = {
      archivedAt: new Date(),
      archiveReason: dto.reason,
    };
    // Soft-delete SEMPRE — histórico clínico retido 5 anos (RGPD red line 4).
    return this.applyUpdate(actor, id, before, data, 'resident.archived');
  }

  private async applyUpdate(
    actor: JwtPayload,
    id: string,
    before: Resident,
    data: Prisma.ResidentUpdateInput,
    action: string,
  ) {
    const [updated] = await tenantBatch(this.prisma, actor.lar_id, [
      this.prisma.resident.update({ where: { id }, data }),
      this.prisma.auditLog.create({
        data: {
          larId: actor.lar_id,
          userId: actor.sub,
          action,
          entityType: 'resident',
          entityId: id,
          before: before as unknown as Prisma.InputJsonValue,
          after: data as Prisma.InputJsonValue,
        },
      }),
    ]);
    return toResidentResponse(updated as Resident);
  }

  private async audit(
    actor: JwtPayload,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await forTenant(this.prisma, actor.lar_id).auditLog.create({
      data: {
        larId: actor.lar_id,
        userId: actor.sub,
        action,
        entityType: 'resident',
        entityId,
        before: (before as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        after: (after as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }
}
