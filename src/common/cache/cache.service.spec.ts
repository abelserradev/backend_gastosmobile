import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService } from './cache.service';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    ping: jest.fn(),
  }));
});

const mockConfigService = (redisUrl?: string): ConfigService => {
  return {
    get: jest.fn((key: string) => (key === 'REDIS_URL' ? redisUrl : undefined)),
  } as unknown as ConfigService;
};

describe('CacheService', () => {
  describe('sin REDIS_URL', () => {
    let service: CacheService;

    beforeEach(() => {
      service = new CacheService(mockConfigService());
    });

    it('debe almacenar y recuperar desde memoria', async () => {
      await service.set('key', { value: 42 }, 1000);
      const result = await service.get<{ value: number }>('key');
      expect(result).toEqual({ value: 42 });
    });

    it('debe retornar null para clave inexistente', async () => {
      const result = await service.get('missing');
      expect(result).toBeNull();
    });

    it('debe invalidar clave individual en memoria', async () => {
      await service.set('k1', 'a', 1000);
      await service.del('k1');
      expect(await service.get('k1')).toBeNull();
    });

    it('debe invalidar multiples claves en memoria', async () => {
      await service.set('k1', 'a', 1000);
      await service.set('k2', 'b', 1000);
      await service.set('k3', 'c', 1000);
      await service.delMany(['k1', 'k2']);
      expect(await service.get('k1')).toBeNull();
      expect(await service.get('k2')).toBeNull();
      expect(await service.get('k3')).toEqual('c');
    });

    it('delMany vacio no debe fallar', async () => {
      await expect(service.delMany([])).resolves.toBeUndefined();
    });

    it('isUsingRedis debe retornar false y ping false', async () => {
      expect(service.isUsingRedis()).toBe(false);
      expect(await service.ping()).toBe(false);
    });
  });

  describe('con REDIS_URL', () => {
    let service: CacheService;
    let redisMock: jest.Mocked<Redis>;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CacheService,
          {
            provide: ConfigService,
            useValue: mockConfigService('redis://localhost:6379'),
          },
        ],
      }).compile();

      service = module.get<CacheService>(CacheService);
      redisMock = (service as unknown as { redis: jest.Mocked<Redis> }).redis;
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('isUsingRedis debe retornar true', () => {
      expect(service.isUsingRedis()).toBe(true);
    });

    it('debe usar Redis para set/get', async () => {
      redisMock.get.mockResolvedValueOnce(JSON.stringify({ value: 42 }));
      await service.set('key', { value: 42 }, 5000);

      expect(redisMock.setex.mock.calls).toEqual([
        ['gastos:key', 5, JSON.stringify({ value: 42 })],
      ]);

      const result = await service.get<{ value: number }>('key');
      expect(redisMock.get.mock.calls).toEqual([['gastos:key']]);
      expect(result).toEqual({ value: 42 });
    });

    it('debe retornar null cuando Redis no tiene la clave', async () => {
      redisMock.get.mockResolvedValueOnce(null);
      const result = await service.get('missing');
      expect(result).toBeNull();
    });

    it('debe invalidar clave individual en Redis', async () => {
      await service.del('k1');
      expect(redisMock.del.mock.calls).toEqual([['gastos:k1']]);
    });

    it('debe invalidar multiples claves en Redis con prefijo', async () => {
      await service.delMany(['k1', 'k2']);
      expect(redisMock.del.mock.calls).toEqual([['gastos:k1', 'gastos:k2']]);
    });

    it('ping debe retornar true cuando Redis responde PONG', async () => {
      redisMock.ping.mockResolvedValueOnce('PONG');
      expect(await service.ping()).toBe(true);
    });

    it('ping debe retornar false cuando Redis no responde PONG', async () => {
      redisMock.ping.mockResolvedValueOnce('OTHER');
      expect(await service.ping()).toBe(false);
    });

    it('debe degradar silenciosamente si Redis falla en get', async () => {
      redisMock.get.mockRejectedValueOnce(new Error('Redis down'));
      const result = await service.get('key');
      expect(result).toBeNull();
    });

    it('debe degradar silenciosamente si Redis falla en set', async () => {
      redisMock.setex.mockRejectedValueOnce(new Error('Redis down'));
      await expect(service.set('key', 'value', 1000)).resolves.toBeUndefined();
    });

    it('debe degradar silenciosamente si Redis falla en del', async () => {
      redisMock.del.mockRejectedValueOnce(new Error('Redis down'));
      await expect(service.del('key')).resolves.toBeUndefined();
    });

    it('ping debe retornar false si Redis falla', async () => {
      redisMock.ping.mockRejectedValueOnce(new Error('Redis down'));
      expect(await service.ping()).toBe(false);
    });
  });
});
