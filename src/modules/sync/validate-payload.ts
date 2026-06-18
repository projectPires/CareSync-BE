import { UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

/**
 * Run a sync mutation payload through its target DTO's class-validator rules
 * BEFORE dispatching to the clinical service.
 *
 * Offline mutations arrive as an untyped `Record<string, unknown>` (the outer
 * SyncMutationDto only checks `@IsObject`), so they never pass through the
 * global ValidationPipe like an online HTTP body does. Without this, a
 * malformed payload would surface as an opaque INTERNAL error instead of a
 * clean per-item VALIDATION result — and any future mutation type that relies
 * on its DTO validators would be unprotected. Mirrors the pipe contract so the
 * sync and HTTP paths enforce the same shape.
 */
export function toValidatedInstance<T extends object>(cls: new () => T, payload: object): T {
  const instance = plainToInstance(cls, payload);
  const errors = validateSync(instance, { forbidUnknownValues: false });
  if (errors.length > 0) {
    throw new UnprocessableEntityException('payload de sync inválido para o tipo de mutação');
  }
  return instance;
}
