import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type Redis from 'ioredis';
import { RateLimitGuard } from './rate-limit.guard';

class FakeRedis {
  store = new Map<string, number>();
  fail = false;
  async incr(k: string): Promise<number> {
    if (this.fail) throw new Error('redis down');
    const n = (this.store.get(k) ?? 0) + 1;
    this.store.set(k, n);
    return n;
  }
  async expire(): Promise<number> {
    return 1;
  }
  async ttl(): Promise<number> {
    return 42;
  }
}

type ResStub = { setHeader: (k: string, v: string) => void };

// Minimal stubs — cast through `unknown` to the real types (no `any`).
function context(req: unknown, res: ResStub = { setHeader: () => {} }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getHandler: () => 'h',
    getClass: () => 'c',
  } as unknown as ExecutionContext;
}

function reflector(skip: boolean): Reflector {
  return { getAllAndOverride: () => skip } as unknown as Reflector;
}

describe('RateLimitGuard', () => {
  it('allows the first 10 unauthenticated (per-IP) requests and blocks the 11th', async () => {
    const redis = new FakeRedis();
    const guard = new RateLimitGuard(reflector(false), redis as unknown as Redis);
    const req = { ip: '1.2.3.4' };
    for (let i = 0; i < 10; i++) {
      await expect(guard.canActivate(context(req))).resolves.toBe(true);
    }
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(HttpException);
  });

  it('uses the higher per-user limit (60/min) when authenticated', async () => {
    const redis = new FakeRedis();
    const guard = new RateLimitGuard(reflector(false), redis as unknown as Redis);
    const req = { ip: '1.2.3.4', user: { sub: 'u1' } };
    for (let i = 0; i < 60; i++) {
      await expect(guard.canActivate(context(req))).resolves.toBe(true);
    }
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(HttpException);
  });

  it('skips entirely when @SkipRateLimit is set (never touches redis)', async () => {
    const redis = new FakeRedis();
    const guard = new RateLimitGuard(reflector(true), redis as unknown as Redis);
    for (let i = 0; i < 100; i++) {
      await expect(guard.canActivate(context({ ip: '1.2.3.4' }))).resolves.toBe(true);
    }
    expect(redis.store.size).toBe(0);
  });

  it('fails open when the redis backend is unavailable', async () => {
    const redis = new FakeRedis();
    redis.fail = true;
    const guard = new RateLimitGuard(reflector(false), redis as unknown as Redis);
    await expect(guard.canActivate(context({ ip: '1.2.3.4' }))).resolves.toBe(true);
  });

  it('sets a Retry-After header (seconds until window reset) when it blocks', async () => {
    const redis = new FakeRedis();
    const guard = new RateLimitGuard(reflector(false), redis as unknown as Redis);
    const headers: Record<string, string> = {};
    const res: ResStub = {
      setHeader: (k, v) => {
        headers[k] = v;
      },
    };
    const req = { ip: '9.9.9.9' };
    for (let i = 0; i < 10; i++) {
      await guard.canActivate(context(req, res));
    }
    await expect(guard.canActivate(context(req, res))).rejects.toBeInstanceOf(HttpException);
    expect(headers['Retry-After']).toBe('42'); // FakeRedis.ttl()
  });
});
