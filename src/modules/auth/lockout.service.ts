import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../../redis/redis.module';

const WINDOW_SEC = 5 * 60;
const LOCK_SEC = 30 * 60;
const MAX_ATTEMPTS = 5;

/**
 * Failed-login lockout (NFR §7): 5 falhas em 5 min → conta bloqueada 30 min.
 * Keys are sha256(email) — never the email itself (no PII in Redis keys).
 */
@Injectable()
export class LockoutService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private keys(email: string): { fail: string; lock: string } {
    const h = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32);
    return { fail: `auth:fail:${h}`, lock: `auth:lock:${h}` };
  }

  async isLocked(email: string): Promise<boolean> {
    return (await this.redis.exists(this.keys(email).lock)) === 1;
  }

  /** Returns true when this failure crossed the threshold (lock just engaged). */
  async registerFailure(email: string): Promise<boolean> {
    const { fail, lock } = this.keys(email);
    const count = await this.redis.incr(fail);
    if (count === 1) await this.redis.expire(fail, WINDOW_SEC);
    if (count >= MAX_ATTEMPTS) {
      await this.redis.set(lock, '1', 'EX', LOCK_SEC);
      await this.redis.del(fail);
      return true;
    }
    return false;
  }

  async clear(email: string): Promise<void> {
    const { fail, lock } = this.keys(email);
    await this.redis.del(fail, lock);
  }
}
