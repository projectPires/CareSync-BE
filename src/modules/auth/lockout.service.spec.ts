import Redis from 'ioredis';
import { LockoutService } from './lockout.service';

function fakeRedis() {
  const store = new Map<string, { value: string; count: number }>();
  return {
    store,
    exists: jest.fn(async (key: string) => (store.has(key) ? 1 : 0)),
    incr: jest.fn(async (key: string) => {
      const entry = store.get(key) ?? { value: '0', count: 0 };
      entry.count += 1;
      store.set(key, entry);
      return entry.count;
    }),
    expire: jest.fn(async () => 1),
    set: jest.fn(async (key: string) => {
      store.set(key, { value: '1', count: 0 });
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => {
      for (const k of keys) store.delete(k);
      return keys.length;
    }),
  };
}

describe('LockoutService', () => {
  it('locks after 5 failures within the window', async () => {
    const redis = fakeRedis();
    const svc = new LockoutService(redis as unknown as Redis);

    for (let i = 1; i <= 4; i++) {
      expect(await svc.registerFailure('a@b.pt')).toBe(false);
      expect(await svc.isLocked('a@b.pt')).toBe(false);
    }
    expect(await svc.registerFailure('a@b.pt')).toBe(true); // 5th engages lock
    expect(await svc.isLocked('a@b.pt')).toBe(true);
  });

  it('clear() removes both counters', async () => {
    const redis = fakeRedis();
    const svc = new LockoutService(redis as unknown as Redis);
    for (let i = 0; i < 5; i++) await svc.registerFailure('a@b.pt');
    await svc.clear('a@b.pt');
    expect(await svc.isLocked('a@b.pt')).toBe(false);
  });

  it('never stores the raw email in Redis keys (PII)', async () => {
    const redis = fakeRedis();
    const svc = new LockoutService(redis as unknown as Redis);
    await svc.registerFailure('sofia@larbemestar.pt');
    for (const key of redis.store.keys()) {
      expect(key).not.toContain('sofia');
      expect(key).not.toContain('@');
    }
  });
});
