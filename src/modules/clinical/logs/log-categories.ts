import { UnprocessableEntityException } from '@nestjs/common';
import { LogCategory } from '@prisma/client';

/**
 * Allowed `kind` values per LogEntry category (derived from Notion §6 M3/M4/M5).
 * `kind` is a free string in the schema; this is the server-side contract the
 * Worker App codegens against. Confirm the taxonomy with Cláudia before v1.
 */
export const LOG_KINDS: Record<LogCategory, readonly string[]> = {
  medical: ['medicacao', 'sinais', 'outro'],
  nutrition: ['refeicao', 'hidratacao', 'lanche'],
  hygiene: ['banho', 'higiene_oral', 'higiene_intima', 'fralda', 'cuidados'],
  social: ['atividade', 'visita', 'outro'],
};

/** Meals / snacks may carry an intake percentage (0–100) in `value`. */
const INTAKE_KINDS: ReadonlySet<string> = new Set(['refeicao', 'lanche']);

/**
 * Category-specific validation of a log entry's kind + value (clinical accuracy,
 * issue #10 AC#2). Throws 422 on a bad shape, BEFORE any side effect.
 */
export function validateLogEntry(category: LogCategory, kind: string, value: string | null): void {
  if (!LOG_KINDS[category].includes(kind)) {
    throw new UnprocessableEntityException(`kind inválido para a categoria ${category}`);
  }
  if (category === 'nutrition' && INTAKE_KINDS.has(kind) && value != null && value !== '') {
    const pct = Number(value);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new UnprocessableEntityException('intake (value) deve ser uma percentagem 0–100');
    }
  }
}
