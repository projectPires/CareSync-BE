import { createHash } from 'node:crypto';
import { timingSafeEqualHex } from './safe-equal';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('timingSafeEqualHex', () => {
  it('returns true for identical hex digests', () => {
    expect(timingSafeEqualHex(sha('secret'), sha('secret'))).toBe(true);
  });

  it('returns false for different digests of equal length', () => {
    expect(timingSafeEqualHex(sha('secret'), sha('other'))).toBe(false);
  });

  it('returns false (no throw) when lengths differ', () => {
    expect(timingSafeEqualHex(sha('secret'), 'deadbeef')).toBe(false);
  });
});
