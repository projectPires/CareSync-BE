import { Module } from '@nestjs/common';

/**
 * Auth module — JWT 15 min + rotating refresh 30 d, PIN exchange, lockout, invites.
 * Implementation: issue #3.
 */
@Module({})
export class AuthModule {}
