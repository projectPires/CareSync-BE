import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Base Prisma client (Prisma 7 driver-adapter over pg).
 *
 * IMPORTANT (prisma-rls-guardian invariant 4): every tenant table has
 * RLS + FORCE — this raw client sees ZERO tenant rows because it carries no
 * `app.current_lar_id`. All tenant data access must go through
 * `forTenant(larId)` (see tenant.ts). Direct use of this service is reserved
 * for system paths (migrations tooling, health) and the audited back-office
 * role (#30).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
