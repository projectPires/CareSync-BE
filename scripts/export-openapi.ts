import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/openapi';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  const document = buildOpenApiDocument(app);
  const out = resolve(__dirname, '..', 'openapi.json');
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log(`OpenAPI spec written to ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
