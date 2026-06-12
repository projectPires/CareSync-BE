import { Module } from '@nestjs/common';

/**
 * PDF module — server-side Puppeteer reports (inspection, portability).
 * The INEM PDF is client-side; this module never renders it.
 * Implementation: issue #24.
 */
@Module({})
export class PdfModule {}
