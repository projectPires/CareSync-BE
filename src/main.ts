import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { buildOpenApiDocument, setupSwagger } from './openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Dev-only HTTP request logger — prints every call so local FE↔BE integration
  // is visible in the terminal. Logs method + PATH (never originalUrl) + status
  // + duration; req.path drops the query string so search terms / any PII in
  // query params can never reach the logs (RGPD red line 1). Gated on
  // NODE_ENV === 'development' via the validated config (not process.env, and
  // NOT `!== production` — that would also log in test/staging).
  if (config.get<string>('NODE_ENV') === 'development') {
    const http = new Logger('HTTP');
    app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      res.on('finish', () => {
        const ms = Date.now() - start;
        const line = `${req.method} ${req.path} -> ${res.statusCode} ${ms}ms`;
        if (res.statusCode >= 500) http.error(line);
        else if (res.statusCode >= 400) http.warn(line);
        else http.log(line);
      });
      next();
    });
  }

  // API única sem versões (decidido 2026-06-12): o contrato evolui de forma
  // ADITIVA apenas — nunca remover/renomear campos nem mudar semântica.
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  setupSwagger(app, buildOpenApiDocument(app));

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
}

void bootstrap();
