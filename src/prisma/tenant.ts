import { PrismaClient } from '@prisma/client';

/**
 * Tenant-scoped Prisma client (the ONLY way to touch tenant tables).
 *
 * Wraps every model operation in a batch transaction whose first statement
 * sets the tenant context transaction-locally:
 *
 *   set_config('app.current_lar_id', <larId>, true)
 *                                            ^^^^ transaction-local — mandatory
 *                                                 with connection pooling
 *
 * RLS policies (migration SQL) then filter every row by lar_id. The official
 * Prisma RLS extension pattern: both statements run on the same connection,
 * so the setting is visible to the query and gone when the transaction ends.
 */
export function forTenant(prisma: PrismaClient, larId: string) {
  return prisma.$extends({
    name: `tenant:${larId}`,
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.current_lar_id', ${larId}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof forTenant>;
