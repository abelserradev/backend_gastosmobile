import { ConfigService } from '@nestjs/config';
import { GastosThrottlerStorage } from './gastos-throttler.storage';
import { CacheService } from './cache.service';

describe('GastosThrottlerStorage', () => {
  const build = (redisUrl?: string, usingRedis = false) => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'REDIS_URL' ? redisUrl : undefined,
      ),
    } as unknown as ConfigService;
    const cache = {
      isUsingRedis: jest.fn(() => usingRedis),
      incrementFixedWindow: jest
        .fn()
        .mockResolvedValue({ count: 2, pttlMs: 55_000 }),
    } as unknown as CacheService;
    const storage = new GastosThrottlerStorage(config, cache);
    return { storage, cache };
  };

  it('debe usar Redis cuando REDIS_URL y conexion activa', async () => {
    const { storage, cache } = build('redis://localhost:6379', true);
    const result = await storage.increment('ip-1', 60_000, 100, 0, 'default');

    expect(result.totalHits).toBe(2);
    expect(result.isBlocked).toBe(false);
    expect(result.timeToExpire).toBeGreaterThan(0);
    expect(cache.incrementFixedWindow).toHaveBeenCalledWith(
      'throttle:default:ip-1',
      60_000,
    );
  });

  it('debe marcar bloqueo cuando supera el limite', async () => {
    const { storage, cache } = build('redis://localhost:6379', true);
    (cache.incrementFixedWindow as jest.Mock).mockResolvedValueOnce({
      count: 101,
      pttlMs: 30_000,
    });

    const result = await storage.increment('ip-2', 60_000, 100, 0, 'default');

    expect(result.isBlocked).toBe(true);
    expect(result.totalHits).toBe(101);
  });

  it('debe usar memoria cuando no hay REDIS_URL', async () => {
    const { storage } = build(undefined, false);
    const result = await storage.increment('ip-3', 60_000, 100, 0, 'default');

    expect(result.totalHits).toBe(1);
    expect(result.isBlocked).toBe(false);
  });
});
