import { Module } from '@nestjs/common';
import { BcvModule } from '../bcv/bcv.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [BcvModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
