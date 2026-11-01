import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../common/cache/cache.service';
import { isPaymentComparisonEnabled } from './payment-comparison.config';
import { PaymentComparisonService } from './payment-comparison.service';

const CLEANUP_LOCK_KEY = 'lock:comparison-cleanup';
/** Un poco menos de 1 h para que la siguiente réplica pueda tomar el lock al cambiar el minuto. */
const LOCK_TTL_MS = 55 * 60 * 1000;

/** GC-004: borra PENDING vencidas; nunca toca CONVERTED (TD-6). */
@Injectable()
export class ComparisonCleanupJob {
  private readonly logger = new Logger(ComparisonCleanupJob.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
    private readonly comparisons: PaymentComparisonService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredPending(): Promise<void> {
    if (!isPaymentComparisonEnabled(this.config)) {
      return;
    }
    const acquired = await this.cache.tryAcquireLock(
      CLEANUP_LOCK_KEY,
      LOCK_TTL_MS,
    );
    if (!acquired) {
      return;
    }
    const deleted = await this.comparisons.deleteExpiredPendingComparisons();
    if (deleted > 0) {
      this.logger.log(
        `Limpieza comparaciones: ${deleted} pendiente(s) vencida(s) eliminada(s)`,
      );
    }
  }
}
