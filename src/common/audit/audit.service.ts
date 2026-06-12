import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { forTenant } from '../../prisma/tenant';
import { auditContext } from './audit-context';

export interface AuditEntryInput {
  larId: string;
  userId?: string;
  /** Convenção: <entidade>.<verbo_passado> — ex: resident.archived, auth.lockout */
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Lado de ESCRITA do audit log (o lado de leitura é o módulo audit, #23).
 *
 * Regra clínica 5 — audit na MESMA transação da mutação: os services compõem
 *   tenantBatch(prisma, larId, [mutação, audit.op({...})])
 * Sem audit ⇒ a mutação faz rollback. A tabela é append-only ao nível da BD
 * (triggers + REVOKE na migração inicial — testado no rls.e2e-spec).
 *
 * Retificações de registos clínicos NUNCA editam: nova linha + supersedes_id
 * + reason (regra clínica 1) — este serviço apenas regista o evento.
 *
 * IP + user agent vêm do AsyncLocalStorage (middleware global) — fora de um
 * request HTTP (jobs, seed) ficam null, como esperado.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** PrismaPromise para compor dentro de tenantBatch (mesma transação). */
  op(input: AuditEntryInput): Prisma.PrismaPromise<unknown> {
    return this.prisma.auditLog.create({ data: this.toData(input) });
  }

  /** Escrita isolada (eventos sem mutação acoplada — ex: lockout, invite). */
  async log(input: AuditEntryInput): Promise<void> {
    await forTenant(this.prisma, input.larId).auditLog.create({ data: this.toData(input) });
  }

  private toData(input: AuditEntryInput): Prisma.AuditLogUncheckedCreateInput {
    const ctx = auditContext.getStore();
    return {
      larId: input.larId,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: (input.before as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      after: (input.after as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    };
  }
}
