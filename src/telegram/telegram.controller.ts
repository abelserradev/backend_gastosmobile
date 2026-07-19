import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramLinkService } from './telegram-link.service';
import type { TelegramUpdate } from './telegram.types';

@Controller('telegram')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(
    private readonly bot: TelegramBotService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('webhook/:secret')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Param('secret') secret: string,
    @Body() update: TelegramUpdate,
  ): Promise<{ ok: true }> {
    const expected = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET')?.trim();
    if (!expected || secret !== expected) {
      throw new ForbiddenException();
    }
    void this.bot.handleUpdate(update).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Webhook update falló: ${msg}`);
    });
    return { ok: true };
  }
}

@Controller('me/telegram')
export class TelegramLinkController {
  constructor(private readonly linkService: TelegramLinkService) {}

  @Post('link-code')
  createLinkCode(@CurrentUser() user: AuthUserPayload) {
    return this.linkService.createLinkCode(user.userId);
  }

  @Get('status')
  status(@CurrentUser() user: AuthUserPayload) {
    return this.linkService.getStatus(user.userId);
  }

  @Delete('link')
  unlink(@CurrentUser() user: AuthUserPayload) {
    return this.linkService.unlink(user.userId);
  }
}
