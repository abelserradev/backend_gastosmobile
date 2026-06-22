import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../common/cache/cache.service';

const DEFAULT_MONTHLY_LIMIT = 1000;

/**
 * Tope global mensual de llamadas a Vision (plan free ~1000/mes).
 * Sin Redis el contador es por proceso; en prod con réplicas usar REDIS_URL.
 */
@Injectable()
export class GoogleVisionQuotaService {
  private readonly logger = new Logger(GoogleVisionQuotaService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  getMonthlyLimit(): number {
    const n = Number(this.config.get<string>('GOOGLE_VISION_MONTHLY_LIMIT'));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MONTHLY_LIMIT;
  }

  async canConsume(): Promise<boolean> {
    const limit = this.getMonthlyLimit();
    const count = await this.cache.getCounter(this.quotaKey());
    return count < limit;
  }

  /** Reserva una unidad de cuota antes de llamar a Vision API. */
  async consume(): Promise<number> {
    const key = this.quotaKey();
    const count = await this.cache.increment(key);
    if (count === 1) {
      await this.cache.expireAtEndOfMonth(key);
    }
    return count;
  }

  async getCurrentUsage(): Promise<number> {
    return this.cache.getCounter(this.quotaKey());
  }

  logQuotaExhausted(): void {
    const limit = this.getMonthlyLimit();
    this.logger.warn(
      `Vision cuota mensual agotada (${limit}/${limit}), solo Tesseract`,
    );
  }

  private quotaKey(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `vision:quota:${now.getFullYear()}-${month}`;
  }
}
