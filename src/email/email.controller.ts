import { Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import { ResendEmailService } from './resend-email.service';

@Controller('email')
export class EmailController {
  constructor(private readonly emails: ResendEmailService) {}

  /**
   * El front no usa el SDK de Resend: llama aquí con cookie JWT para validar el circuito completo.
   */
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('test')
  async sendTest(@CurrentUser() user: AuthUserPayload): Promise<{ ok: true }> {
    await this.emails.sendTestEmailTo(user.email);
    return { ok: true };
  }
}
