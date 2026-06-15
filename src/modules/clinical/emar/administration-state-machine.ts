import { ConflictException } from '@nestjs/common';
import { AdministrationStatus } from '@prisma/client';

/**
 * Administration lifecycle (Notion §7 · clinical hard rule 3):
 *   pending → taken | refused | delayed ; delayed → taken | missed.
 * taken / refused / missed are terminal. Anything else is a 409.
 *
 * Transitions are NEVER in-place UPDATEs — each one inserts a new append-only
 * row with supersedes_id (hard rule 1). This module only decides legality.
 */
export const ADMINISTRATION_TRANSITIONS: Record<
  AdministrationStatus,
  readonly AdministrationStatus[]
> = {
  pending: ['taken', 'refused', 'delayed'],
  delayed: ['taken', 'missed'],
  taken: [],
  refused: [],
  missed: [],
};

export function isValidAdministrationTransition(
  from: AdministrationStatus,
  to: AdministrationStatus,
): boolean {
  return ADMINISTRATION_TRANSITIONS[from].includes(to);
}

/**
 * Guards a transition. Throws 409 with the minimal context the mobile client
 * needs to render the conflict — never the full row (no clinical data in errors).
 */
export function assertValidTransition(from: AdministrationStatus, to: AdministrationStatus): void {
  if (!isValidAdministrationTransition(from, to)) {
    throw new ConflictException({
      message: `Transição inválida: ${from} → ${to}`,
      currentStatus: from,
      requestedStatus: to,
    });
  }
}
