import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/** Lado de escrita do audit log — global: qualquer módulo compõe audit.op(). */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
