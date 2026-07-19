import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { MeModule } from '../me/me.module';
import { TelegramApiClient } from './telegram-api.client';
import { TelegramBotService } from './telegram-bot.service';
import {
  TelegramLinkController,
  TelegramWebhookController,
} from './telegram.controller';
import { TelegramEntityResolverService } from './telegram-entity-resolver.service';
import { TelegramIntentParserService } from './telegram-intent-parser.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramMutationService } from './telegram-mutation.service';
import { TelegramPendingService } from './telegram-pending.service';

@Module({
  imports: [MeModule, InventoryModule],
  controllers: [TelegramWebhookController, TelegramLinkController],
  providers: [
    TelegramApiClient,
    TelegramLinkService,
    TelegramIntentParserService,
    TelegramEntityResolverService,
    TelegramMutationService,
    TelegramPendingService,
    TelegramBotService,
  ],
  exports: [TelegramLinkService, TelegramApiClient],
})
export class TelegramModule {}
