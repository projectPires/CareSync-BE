import { Module } from '@nestjs/common';
import { LaresController } from './lares.controller';
import { LaresService } from './lares.service';

@Module({
  controllers: [LaresController],
  providers: [LaresService],
})
export class LaresModule {}
