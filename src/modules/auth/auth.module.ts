import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LockoutService } from './lockout.service';
import { TokenService } from './token.service';

/**
 * Auth — JWT 15 min + rotating refresh 30 d, PIN exchange, lockout, invites.
 * JwtModule is global so the app-wide JwtAuthGuard can verify tokens.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.getOrThrow<number>('JWT_ACCESS_TTL_SEC') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, LockoutService],
  exports: [TokenService],
})
export class AuthModule {}
