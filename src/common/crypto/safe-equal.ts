import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time comparison of two hex digests (e.g. sha256 token hashes), so an
 * attacker cannot recover a stored hash byte-by-byte from response timing.
 * Length is compared first (it is not secret — both sides are fixed-width
 * sha256 hex) to avoid the length-mismatch throw in `timingSafeEqual`.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
