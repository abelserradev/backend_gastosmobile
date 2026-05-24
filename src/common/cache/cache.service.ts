import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

interface MemoryEntry<T> {
  data: T;
  expiresAt: number;
}

const KEY_PREFIX = 'gastos:';

/**
 * Caché caliente opcional con Redis; sin REDIS_URL usa memoria del proceso.
 * PostgreSQL sigue siendo el histórico durable (BcVOfficialRate).
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private readonly memory = new Map<string, MemoryEntry<unknown>>();

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL')?.trim();
    if (!redisUrl) {
      return;
    }
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: true,
    });
    this.redis.connect().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Redis no disponible; caché en memoria: ${msg}`);
      this.redis = null;
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  private scopedKey(key: string): string {
    return `${KEY_PREFIX}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(this.scopedKey(key));
        if (!raw) {
          return null;
        }
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    }
    const entry = this.memory.get(key) as MemoryEntry<T> | undefined;
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.memory.delete(key);
      return null;
    }
    return entry.data;
  }

  async set<T>(key: string, data: T, ttlMs: number): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.setex(
          this.scopedKey(key),
          Math.max(1, Math.ceil(ttlMs / 1000)),
          JSON.stringify(data),
        );
      } catch {
        // Si Redis falla en caliente, no bloqueamos el flujo principal.
      }
      return;
    }
    this.memory.set(key, { data, expiresAt: Date.now() + ttlMs });
  }
}
