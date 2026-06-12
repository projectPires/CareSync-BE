import { AsyncLocalStorage } from 'node:async_hooks';
import { NextFunction, Request, Response } from 'express';

export interface AuditRequestContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Contexto por-request (AsyncLocalStorage) para enriquecer entradas de audit
 * com IP + user agent sem os passar à mão por todos os services (NFR §4:
 * who / what / when / WHERE).
 */
export const auditContext = new AsyncLocalStorage<AuditRequestContext>();

/** Middleware global — corre antes de guards/handlers (ver AppModule). */
export function auditContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  auditContext.run(
    {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    },
    next,
  );
}
