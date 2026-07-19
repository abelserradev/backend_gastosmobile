import { Module } from '@nestjs/common';
import { MeModule } from '../me/me.module';
import { TelegramApiClient } from './telegram-api.client';
import { TelegramBotService } from './telegram-bot.service';
import {
  TelegramLinkController,
  TelegramWebhookController,
} from './telegram.controller';
import { TelegramIntentParserService } from './telegram-intent-parser.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramPendingService } from './telegram-pending.service';

@Module({
  imports: [MeModule],
  controllers: [TelegramWebhookController, TelegramLinkController],
  providers: [
    TelegramApiClient,
    TelegramLinkService,
    TelegramIntentParserService,
    TelegramPendingService,
    TelegramBotService,
  ],
  exports: [TelegramLinkService, TelegramApiClient],
})
export class TelegramModule {}
