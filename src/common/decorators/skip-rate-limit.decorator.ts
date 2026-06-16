import { SetMetadata } from '@nestjs/common';

export const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';

/**
 * Marks a route as exempt from the per-user rate limit (NFR §7 — 60 req/min).
 * Rate limiting itself is not implemented yet; this marker is the contract the
 * future throttling guard will honour. The sync batch (#7) carries it: a 2-hour
 * offline flush legitimately bursts well past 60 req/min.
 */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
