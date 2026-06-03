import { Module } from '@nestjs/common';
import { BcvModule } from '../bcv/bcv.module';
import { ProfileCollaboratorsModule } from '../profile-collaborators/profile-collaborators.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [BcvModule, EmailModule, ProfileCollaboratorsModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
