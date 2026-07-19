import { Injectable } from '@nestjs/common';
import { CacheService } from '../common/cache/cache.service';
import type { TelegramPendingAction } from './telegram.types';

const PENDING_PREFIX = 'telegram:pending:';
const PENDING_TTL_MS = 5 * 60 * 1000;

/** Estado breve cuando el parser no puede decidir gasto vs ingreso. */
@Injectable()
export class TelegramPendingService {
  constructor(private readonly cache: CacheService) {}

  async save(chatId: string, action: TelegramPendingAction): Promise<void> {
    await this.cache.set(`${PENDING_PREFIX}${chatId}`, action, PENDING_TTL_MS);
  }

  async get(chatId: string): Promise<TelegramPendingAction | null> {
    return this.cache.get<TelegramPendingAction>(`${PENDING_PREFIX}${chatId}`);
  }

  async clear(chatId: string): Promise<void> {
    await this.cache.set(`${PENDING_PREFIX}${chatId}`, null, 1);
  }
}
