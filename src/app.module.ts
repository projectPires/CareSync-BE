import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from './common/audit/audit.module';
import { auditContextMiddleware } from './common/audit/audit-context';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { validateEnv } from './config/env';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { ClinicalModule } from './modules/clinical/clinical.module';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { LaresModule } from './modules/lares/lares.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { ResidentsModule } from './modules/residents/residents.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    AuditModule,
    HealthModule,
    AuthModule,
    LaresModule,
    UsersModule,
    ResidentsModule,
    ClinicalModule,
    AlertsModule,
    BillingModule,
    PdfModule,
    JobsModule,
  ],
  providers: [
    // Ordem importa: autenticação primeiro, autorização (matriz §8) depois.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Contexto de audit (IP + user agent) disponível em toda a request via ALS.
    consumer.apply(auditContextMiddleware).forRoutes('{*splat}');
  }
}
