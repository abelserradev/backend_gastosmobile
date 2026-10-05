import { InventoryService } from './inventory.service';
import { INVENTORY_SUMMARY_TTL_MS } from './inventory-cache.util';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: {
    inventoryItem: { count: jest.Mock; fields: { minStock: unknown } };
    stockMovement: { findFirst: jest.Mock };
    profile: { findUnique: jest.Mock };
  };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let profileAccess: { assertInventoryAccess: jest.Mock };

  const profileId = 'prof-1';
  const userId = 'user-1';

  beforeEach(() => {
    cache = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn(),
    };
    profileAccess = {
      assertInventoryAccess: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      inventoryItem: {
        count: jest.fn(),
        fields: { minStock: 'minStock' },
      },
      stockMovement: { findFirst: jest.fn() },
      profile: { findUnique: jest.fn() },
    };
    service = new InventoryService(
      prisma as never,
      cache as never,
      profileAccess as never,
      {} as never,
      {} as never,
    );
  });

  describe('getSummary', () => {
    it('debe retornar resumen cacheado sin consultar Prisma', async () => {
      const cached = {
        totalItems: 3,
        lowStockCount: 1,
        totalStockValue: 0,
        lastMovementAt: '2026-01-01T00:00:00.000Z',
      };
      cache.get.mockResolvedValueOnce(cached);

      const result = await service.getSummary(profileId, userId);

      expect(result).toEqual(cached);
      expect(prisma.inventoryItem.count).not.toHaveBeenCalled();
      expect(cache.get).toHaveBeenCalledWith(`inventory:summary:${profileId}`);
    });

    it('debe cargar desde BD y guardar en cache cuando no hay hit', async () => {
      cache.get.mockResolvedValueOnce(null);
      prisma.inventoryItem.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2);
      prisma.stockMovement.findFirst.mockResolvedValueOnce({
        createdAt: new Date('2026-02-01T12:00:00.000Z'),
      });

      const result = await service.getSummary(profileId, userId);

      expect(result.totalItems).toBe(5);
      expect(result.lowStockCount).toBe(2);
      expect(result.lastMovementAt).toBe('2026-02-01T12:00:00.000Z');
      expect(cache.set).toHaveBeenCalledWith(
        `inventory:summary:${profileId}`,
        result,
        INVENTORY_SUMMARY_TTL_MS,
      );
    });
  });
});
