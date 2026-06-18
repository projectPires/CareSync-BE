import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type Redis from 'ioredis';
import { REDIS } from '../../redis/redis.module';
import { JwtPayload } from '../auth/jwt-payload';
import { SKIP_RATE_LIMIT_KEY } from '../decorators/skip-rate-limit.decorator';

const WINDOW_SEC = 60;
const USER_PER_MIN = 60; // NFR §7 — per authenticated user
const IP_PER_MIN = 10; // NFR §7 — per IP, stricter (covers /auth/* brute-force)

/**
 * Fixed-window rate limiter (NFR §7), Redis-backed so it is correct across
 * instances. Registered as a global guard AFTER JwtAuthGuard so it can key by
 * user when authenticated and fall back to IP otherwise:
 *   - authenticated  → 60 req/min per user.sub
 *   - unauthenticated → 10 req/min per IP (login / refresh / invite endpoints).
 * Honours @SkipRateLimit (the sync batch legitimately bursts past 60/min).
 *
 * Fails OPEN if Redis is unreachable: a limiter outage must never block a
 * clinical or emergency path (spirit of clinical hard rule 10).
 *
 * NOTE: behind a reverse proxy in production, Express `trust proxy` must be set
 * or req.ip is the proxy IP and all clients share one per-IP bucket.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtPayload | undefined;
    const bucket = user ? 'user' : 'ip';
    const id = user ? user.sub : (req.ip ?? 'unknown');
    const limit = user ? USER_PER_MIN : IP_PER_MIN;
    const key = `ratelimit:${bucket}:${id}`;

    let count: number;
    try {
      count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, WINDOW_SEC);
    } catch {
      this.logger.warn(`rate-limit backend unavailable — allowing ${bucket} request`);
      return true; // fail open
    }

    if (count > limit) {
      // Tell the client when to retry (seconds until the window resets). TTL
      // read is best-effort — fall back to the full window if Redis can't say.
      const ttl = await this.redis.ttl(key).catch(() => WINDOW_SEC);
      const retryAfter = ttl > 0 ? ttl : WINDOW_SEC;
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'TooManyRequests',
          message: 'Demasiados pedidos — abranda e tenta novamente.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
