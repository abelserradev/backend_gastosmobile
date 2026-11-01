import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from '../common/cache/cache.service';
import { ComparisonCleanupJob } from './comparison-cleanup.job';
import { PaymentComparisonService } from './payment-comparison.service';

describe('ComparisonCleanupJob (GC-004 / TD-6)', () => {
  let job: ComparisonCleanupJob;
  const cache = { tryAcquireLock: jest.fn() };
  const comparisons = { deleteExpiredPendingComparisons: jest.fn() };
  const config = { get: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string, def?: unknown) => {
      if (key === 'PAYMENT_COMPARISON_ENABLED') {
        return 'true';
      }
      return def;
    });
    cache.tryAcquireLock.mockResolvedValue(true);
    comparisons.deleteExpiredPendingComparisons.mockResolvedValue(2);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparisonCleanupJob,
        { provide: ConfigService, useValue: config },
        { provide: CacheService, useValue: cache },
        { provide: PaymentComparisonService, useValue: comparisons },
      ],
    }).compile();
    job = module.get(ComparisonCleanupJob);
  });

  it('no corre si el feature flag está apagado', async () => {
    config.get.mockImplementation((key: string, def?: unknown) => {
      if (key === 'PAYMENT_COMPARISON_ENABLED') {
        return 'false';
      }
      return def;
    });
    await job.purgeExpiredPending();
    expect(cache.tryAcquireLock).not.toHaveBeenCalled();
  });

  it('borra vencidas cuando toma el lock', async () => {
    await job.purgeExpiredPending();
    expect(cache.tryAcquireLock).toHaveBeenCalledWith(
      'lock:comparison-cleanup',
      expect.any(Number),
    );
    expect(comparisons.deleteExpiredPendingComparisons).toHaveBeenCalled();
  });

  it('sale en silencio si otra réplica tiene el lock', async () => {
    cache.tryAcquireLock.mockResolvedValue(false);
    await job.purgeExpiredPending();
    expect(comparisons.deleteExpiredPendingComparisons).not.toHaveBeenCalled();
  });
});
