import { validateEnv } from './env';

describe('validateEnv', () => {
  it('applies docker-compose defaults in development', () => {
    const env = validateEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_URL).toBe('postgresql://caresync_app:caresync_app@localhost:5432/caresync');
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.S3_BUCKET).toBe('caresync');
  });

  it('coerces PORT from string', () => {
    expect(validateEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects an invalid PORT', () => {
    expect(() => validateEnv({ PORT: 'not-a-port' })).toThrow(/PORT/);
  });

  it('rejects an invalid DATABASE_URL', () => {
    expect(() => validateEnv({ DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/);
  });

  it('refuses dev defaults in production', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(
      /must be set explicitly in production/,
    );
  });

  it('accepts production when every sensitive value is explicit', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://app:secret@db.internal:5432/caresync',
      REDIS_URL: 'redis://redis.internal:6379',
      S3_ENDPOINT: 'https://s3.eu-central-1.example.com',
      S3_ACCESS_KEY: 'real-key',
      S3_SECRET_KEY: 'real-secret',
    });
    expect(env.NODE_ENV).toBe('production');
  });
});
