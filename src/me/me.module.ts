import { Module } from '@nestjs/common';
import { BcvModule } from '../bcv/bcv.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { EmailModule } from 'src/email/email.module';

@Module({
  imports: [BcvModule, EmailModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
