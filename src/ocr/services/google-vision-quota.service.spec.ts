import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../common/cache/cache.service';
import { GoogleVisionQuotaService } from './google-vision-quota.service';

describe('GoogleVisionQuotaService', () => {
  let cache: CacheService;
  let quota: GoogleVisionQuotaService;

  beforeEach(() => {
    cache = new CacheService({ get: () => undefined } as ConfigService);
    quota = new GoogleVisionQuotaService(
      {
        get: (key: string) =>
          key === 'GOOGLE_VISION_MONTHLY_LIMIT' ? '3' : undefined,
      } as ConfigService,
      cache,
    );
  });

  it('permite consumir mientras count < límite', async () => {
    expect(await quota.canConsume()).toBe(true);
    await quota.consume();
    expect(await quota.canConsume()).toBe(true);
    await quota.consume();
    expect(await quota.canConsume()).toBe(true);
    await quota.consume();
    expect(await quota.canConsume()).toBe(false);
  });

  it('getMonthlyLimit usa default 1000 si no hay env', () => {
    const defaultQuota = new GoogleVisionQuotaService(
      { get: () => undefined } as ConfigService,
      cache,
    );
    expect(defaultQuota.getMonthlyLimit()).toBe(1000);
  });

  it('consume incrementa el contador del mes', async () => {
    expect(await quota.getCurrentUsage()).toBe(0);
    await quota.consume();
    expect(await quota.getCurrentUsage()).toBe(1);
    await quota.consume();
    expect(await quota.getCurrentUsage()).toBe(2);
  });
});
