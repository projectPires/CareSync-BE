import { SetMetadata } from '@nestjs/common';

export const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';

/**
 * Marks a route as exempt from the rate limit (NFR §7). Honoured by
 * RateLimitGuard (src/common/guards/rate-limit.guard.ts). The sync batch (#7)
 * carries it: a 2-hour offline flush legitimately bursts well past 60 req/min.
 */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
