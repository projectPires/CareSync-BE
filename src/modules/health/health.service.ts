import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Pool } from 'pg';

export type CheckStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: {
    database: CheckStatus;
    redis: CheckStatus;
  };
}

const PING_TIMEOUT_MS = 1500;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ping timeout')), PING_TIMEOUT_MS).unref(),
    ),
  ]);
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      connectionTimeoutMillis: PING_TIMEOUT_MS,
      max: 1,
    });
    this.redis = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });
  }

  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([this.pingDatabase(), this.pingRedis()]);
    return {
      status: database === 'up' && redis === 'up' ? 'ok' : 'degraded',
      checks: { database, redis },
    };
  }

  private async pingDatabase(): Promise<CheckStatus> {
    try {
      await withTimeout(this.pool.query('SELECT 1'));
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async pingRedis(): Promise<CheckStatus> {
    try {
      if (this.redis.status !== 'ready') {
        await withTimeout(this.redis.connect());
      }
      await withTimeout(this.redis.ping());
      return 'up';
    } catch {
      return 'down';
    }
  }

  async onModuleDestroy(): Promise<void> {
    // quit() sends QUIT over the wire — hangs forever if the connection never
    // came up (e.g. Redis down); disconnect() tears down locally.
    const closeRedis =
      this.redis.status === 'ready' ? this.redis.quit() : Promise.resolve(this.redis.disconnect());
    await Promise.allSettled([this.pool.end(), closeRedis]);
  }
}
