import { z } from 'zod';

// Defaults match docker-compose so local dev boots with zero config.
// In production, defaults are refused: every value must be set explicitly.
// The app connects as caresync_app (NOSUPERUSER, NOBYPASSRLS) — never as the
// owner/superuser, which would silently bypass row-level security.
const DEV_DEFAULTS = {
  DATABASE_URL: 'postgresql://caresync_app:caresync_app@localhost:5432/caresync',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
} as const;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).default(DEV_DEFAULTS.DATABASE_URL),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }).default(DEV_DEFAULTS.REDIS_URL),
    S3_ENDPOINT: z.url().default(DEV_DEFAULTS.S3_ENDPOINT),
    S3_ACCESS_KEY: z.string().min(1).default(DEV_DEFAULTS.S3_ACCESS_KEY),
    S3_SECRET_KEY: z.string().min(1).default(DEV_DEFAULTS.S3_SECRET_KEY),
    S3_BUCKET: z.string().min(1).default('caresync'),
    S3_REGION: z.string().min(1).default('eu-central-1'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const [key, devValue] of Object.entries(DEV_DEFAULTS)) {
      if (env[key as keyof typeof DEV_DEFAULTS] === devValue) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} must be set explicitly in production (dev default refused)`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
