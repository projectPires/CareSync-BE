import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule], // TokenService (revogação de sessões na desativação)
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
