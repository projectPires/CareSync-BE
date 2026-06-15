import { RedisOptions } from 'ioredis';

/**
 * Parse REDIS_URL (read via ConfigService — never process.env here) into a
 * BullMQ connection. maxRetriesPerRequest MUST be null for BullMQ's blocking
 * commands.
 */
export function bullConnection(redisUrl: string): RedisOptions {
  const u = new URL(redisUrl);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.pathname.length > 1 ? { db: Number(u.pathname.slice(1)) } : {}),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
