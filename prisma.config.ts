import { defineConfig } from 'prisma/config';

// Prisma 7 CLI config. Connection URL falls back to the docker-compose default
// so offline commands (validate, migrate diff) work with zero local setup —
// mirrors src/config/env.ts (which still refuses dev defaults in production).
try {
  process.loadEnvFile('.env');
} catch {
  // no .env — defaults below apply
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://caresync:caresync@localhost:5432/caresync',
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'node -r ts-node/register/transpile-only prisma/seed.ts',
  },
});
