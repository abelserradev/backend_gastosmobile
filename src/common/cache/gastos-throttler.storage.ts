import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { CacheService } from './cache.service';

/**
 * Contadores de rate limit compartidos entre réplicas cuando hay REDIS_URL.
 * Sin Redis delega al storage en memoria de Nest (comportamiento por defecto).
 */
@Injectable()
export class GastosThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly memory = new ThrottlerStorageService();

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  onApplicationShutdown(): void {
    this.memory.onApplicationShutdown();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    const redisUrl = this.config.get<string>('REDIS_URL')?.trim();
    if (!redisUrl || !this.cache.isUsingRedis() || blockDuration > 0) {
      return this.memory.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }

    try {
      return await this.incrementRedis(
        key,
        ttl,
        limit,
        throttlerName,
      );
    } catch {
      return this.memory.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }

  private async incrementRedis(
    key: string,
    ttlMs: number,
    limit: number,
    throttlerName: string,
  ) {
    const windowKey = `throttle:${throttlerName}:${key}`;
    const { count, pttlMs } = await this.cache.incrementFixedWindow(
      windowKey,
      ttlMs,
    );
    const timeToExpire = Math.max(1, Math.ceil(pttlMs / 1000));
    const isBlocked = count > limit;

    return {
      totalHits: count,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: 0,
    };
  }
}
