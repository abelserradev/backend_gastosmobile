import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InventoryItemService } from './inventory-item.service';
import { CreateInventoryItemDto } from './dto/create-item.dto';
import { UpdateInventoryItemDto } from './dto/update-item.dto';

describe('InventoryItemService', () => {
  let service: InventoryItemService;
  let profileAccess: {
    assertInventoryAccess: jest.Mock;
  };
  let prisma: {
    inventoryItem: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
      fields: { minStock: { lte: any } };
    };
    stockMovement: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const mockProfileId = 'prof-001';
  const mockUserId = 'user-001';
  const mockItemId = 'item-001';

  beforeEach(() => {
    profileAccess = {
      assertInventoryAccess: jest.fn().mockResolvedValue({
        access: 'owner',
        profile: { id: mockProfileId, type: 'comercio' },
      }),
    };
    prisma = {
      inventoryItem: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        fields: { minStock: { lte: {} } },
      },
      stockMovement: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    service = new InventoryItemService(
      prisma as never,
      profileAccess as never,
    );
  });

  describe('listItems', () => {
    it('debe retornar lista de productos del perfil', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([
        {
          id: 'i1',
          name: 'Coca-Cola',
          sku: 'CC-001',
          unit: 'botella',
          minStock: 10,
          currentStock: 50,
          profileId: mockProfileId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.listItems(mockProfileId, mockUserId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Coca-Cola');
      expect(result[0].isLowStock).toBe(false);
    });

    it('debe filtrar por búsqueda cuando se proporciona', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([]);

      await service.listItems(mockProfileId, mockUserId, 'coca');

      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            profileId: mockProfileId,
            OR: [
              { name: { contains: 'coca', mode: 'insensitive' } },
              { sku: { contains: 'coca', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('debe lanzar ForbiddenException si el perfil no pertenece al usuario', async () => {
      profileAccess.assertInventoryAccess.mockRejectedValue(
        new ForbiddenException(),
      );

      await expect(
        service.listItems(mockProfileId, mockUserId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('getItem', () => {
    it('debe retornar un producto específico', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        name: 'Pepsi',
        currentStock: 30,
        minStock: 5,
        profileId: mockProfileId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getItem(
        mockProfileId,
        mockItemId,
        mockUserId,
      );

      expect(result.id).toBe(mockItemId);
      expect(result.isLowStock).toBe(false); // 30 > 5
    });

    it('debe lanzar NotFoundException si el producto no existe', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(
        service.getItem(mockProfileId, mockItemId, mockUserId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createItem', () => {
    const mockDto: CreateInventoryItemDto = {
      name: 'Fanta Naranja',
      sku: 'FNT-001',
      unit: 'botella',
      minStock: 20,
      initialStock: 100,
    };

    it('debe crear producto con movimiento inicial cuando tiene stock inicial', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.create.mockResolvedValue({
        id: mockItemId,
        ...mockDto,
        profileId: mockProfileId,
        currentStock: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createItem(
        mockProfileId,
        mockUserId,
        mockDto,
      );

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.currentStock).toBe(100);
      expect(result.isLowStock).toBe(false);
    });

    it('debe crear producto sin movimiento si no hay stock inicial', async () => {
      const dtoSinStock: CreateInventoryItemDto = {
        name: 'Sprite',
        unit: 'botella',
        minStock: 0,
      };
      prisma.inventoryItem.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.create.mockResolvedValue({
        id: mockItemId,
        ...dtoSinStock,
        sku: null,
        profileId: mockProfileId,
        currentStock: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createItem(
        mockProfileId,
        mockUserId,
        dtoSinStock,
      );

      expect(result.currentStock).toBe(0);
    });

    it('debe rechazar si el perfil no es tipo comercio', async () => {
      profileAccess.assertInventoryAccess.mockRejectedValue(
        new BadRequestException(),
      );

      await expect(
        service.createItem(mockProfileId, mockUserId, mockDto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('debe rechazar SKU duplicado en el mismo perfil', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue({
        id: 'existing',
        sku: 'FNT-001',
      });

      await expect(
        service.createItem(mockProfileId, mockUserId, mockDto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateItem', () => {
    const mockDto: UpdateInventoryItemDto = { name: 'Fanta Naranja 2L' };

    it('debe actualizar nombre del producto', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        name: 'Fanta Naranja',
        sku: 'FNT-001',
        profileId: mockProfileId,
      });
      prisma.inventoryItem.update.mockResolvedValue({
        id: mockItemId,
        name: 'Fanta Naranja 2L',
        sku: 'FNT-001',
        unit: 'botella',
        minStock: 20,
        currentStock: 100,
        profileId: mockProfileId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.updateItem(
        mockProfileId,
        mockItemId,
        mockUserId,
        mockDto,
      );

      expect(result.name).toBe('Fanta Naranja 2L');
    });

    it('debe rechazar cambio de SKU a uno ya existente', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        name: 'Producto A',
        sku: 'OLD-001',
        profileId: mockProfileId,
      });
      prisma.inventoryItem.findUnique.mockResolvedValue({
        id: 'other',
        sku: 'NEW-001',
      });

      await expect(
        service.updateItem(mockProfileId, mockItemId, mockUserId, {
          sku: 'NEW-001',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('deleteItem', () => {
    it('debe eliminar producto sin stock ni movimientos', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        currentStock: 0,
        movements: [],
        profileId: mockProfileId,
      });
      prisma.inventoryItem.delete.mockResolvedValue({});

      await service.deleteItem(mockProfileId, mockItemId, mockUserId);

      expect(prisma.inventoryItem.delete).toHaveBeenCalledWith({
        where: { id: mockItemId },
      });
    });

    it('debe rechazar eliminar producto con movimientos', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        currentStock: 0,
        movements: [{ id: 'mov-001' }],
        profileId: mockProfileId,
      });

      await expect(
        service.deleteItem(mockProfileId, mockItemId, mockUserId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.inventoryItem.delete).not.toHaveBeenCalled();
    });

    it('debe rechazar eliminar producto con stock > 0', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        currentStock: 10,
        movements: [],
        profileId: mockProfileId,
      });

      await expect(
        service.deleteItem(mockProfileId, mockItemId, mockUserId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listLowStock', () => {
    it('debe listar productos con stock igual o menor al mínimo', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([
        {
          id: 'i1',
          name: 'Coca-Cola',
          currentStock: 5,
          minStock: 10,
          profileId: mockProfileId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'i2',
          name: 'Pepsi',
          currentStock: 3,
          minStock: 5,
          profileId: mockProfileId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.listLowStock(mockProfileId, mockUserId);

      expect(result).toHaveLength(2);
      expect(result.every((i) => i.isLowStock)).toBe(true);
    });
  });

  /**
   * FEAT-004 — precio de catálogo opcional en producto.
   * Spec: Escenarios A, E (FEAT-inventory-pricing-optional.md).
   */
  describe('FEAT-004: salePrice en producto', () => {
    it('debe crear producto con salePrice opcional en catálogo', async () => {
      const dtoConPrecio: CreateInventoryItemDto = {
        name: 'Refresco 2L',
        unit: 'pieza',
        minStock: 0,
        salePrice: 2.5,
      };

      prisma.inventoryItem.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.create.mockResolvedValue({
        id: mockItemId,
        ...dtoConPrecio,
        sku: null,
        profileId: mockProfileId,
        currentStock: 0,
        salePrice: { toNumber: () => 2.5 },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createItem(
        mockProfileId,
        mockUserId,
        dtoConPrecio,
      );

      expect(prisma.inventoryItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ salePrice: 2.5 }),
        }),
      );
      expect(result.salePrice).toBe(2.5);
    });

    it('debe crear producto sin salePrice (null en respuesta)', async () => {
      const dtoSinPrecio: CreateInventoryItemDto = {
        name: 'Arroz 1kg',
        unit: 'kg',
        minStock: 5,
      };

      prisma.inventoryItem.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.create.mockResolvedValue({
        id: mockItemId,
        ...dtoSinPrecio,
        sku: null,
        profileId: mockProfileId,
        currentStock: 0,
        salePrice: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createItem(
        mockProfileId,
        mockUserId,
        dtoSinPrecio,
      );

      expect(result.salePrice).toBeNull();
    });

    it('debe actualizar salePrice sin modificar currentStock', async () => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        name: 'Refresco 2L',
        sku: null,
        profileId: mockProfileId,
        salePrice: null,
      });
      prisma.inventoryItem.update.mockResolvedValue({
        id: mockItemId,
        name: 'Refresco 2L',
        sku: null,
        unit: 'pieza',
        minStock: 0,
        currentStock: 20,
        profileId: mockProfileId,
        salePrice: { toNumber: () => 3 },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.updateItem(
        mockProfileId,
        mockItemId,
        mockUserId,
        { salePrice: 3 },
      );

      expect(prisma.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ salePrice: 3 }),
        }),
      );
      expect(result.salePrice).toBe(3);
      expect(result.currentStock).toBe(20);
    });

    it('debe rechazar salePrice negativo al crear', async () => {
      const dtoInvalido: CreateInventoryItemDto = {
        name: 'Producto X',
        unit: 'pieza',
        minStock: 0,
        salePrice: -1,
      };

      await expect(
        service.createItem(mockProfileId, mockUserId, dtoInvalido),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    });
  });
});
