import { Module } from '@nestjs/common';
import { EmailController } from './email.controller';
import { ResendEmailService } from './resend-email.service';

@Module({
  controllers: [EmailController],
  providers: [ResendEmailService],
  exports: [ResendEmailService],
})
export class EmailModule {}
