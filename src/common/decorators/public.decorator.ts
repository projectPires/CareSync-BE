import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without a JWT. Deny-by-default: every route is
 * guarded unless explicitly @Public(). Keep the public surface tiny —
 * auth-security reviews every usage.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
