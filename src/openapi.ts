import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * The OpenAPI spec is the contract the mobile repo (projectPires/CareSync)
 * generates its typed client from. Served at /docs (UI) and /openapi.json;
 * exported to disk via `pnpm openapi:export`.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('CareSync API')
    .setDescription(
      'Backend for CareSync — clinical management of Portuguese ERPI. ' +
        'Multi-tenant (RLS by lar_id), offline-first sync, append-only clinical data.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication, document: OpenAPIObject): void {
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'openapi.json',
  });
}
