import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InventoryItemService } from './inventory-item.service';
import { CreateInventoryItemDto } from './dto/create-item.dto';
import { UpdateInventoryItemDto } from './dto/update-item.dto';

describe('InventoryItemService', () => {
  let service: InventoryItemService;
  let prisma: {
    profile: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
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
    prisma = {
      profile: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
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
    service = new InventoryItemService(prisma as never);
  });

  describe('listItems', () => {
    it('debe retornar lista de productos del perfil', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findMany.mockResolvedValue([
        { id: 'i1', name: 'Coca-Cola', sku: 'CC-001', unit: 'botella', minStock: 10, currentStock: 50, profileId: mockProfileId, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const result = await service.listItems(mockProfileId, mockUserId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Coca-Cola');
      expect(result[0].isLowStock).toBe(false);
    });

    it('debe filtrar por búsqueda cuando se proporciona', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
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
      prisma.profile.findFirst.mockResolvedValue(null);

      await expect(service.listItems(mockProfileId, mockUserId)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('getItem', () => {
    it('debe retornar un producto específico', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        name: 'Pepsi',
        currentStock: 30,
        minStock: 5,
        profileId: mockProfileId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getItem(mockProfileId, mockItemId, mockUserId);

      expect(result.id).toBe(mockItemId);
      expect(result.isLowStock).toBe(false); // 30 > 5
    });

    it('debe lanzar NotFoundException si el producto no existe', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(service.getItem(mockProfileId, mockItemId, mockUserId)).rejects.toBeInstanceOf(NotFoundException);
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
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId, type: 'comercio' });
      prisma.profile.findUnique.mockResolvedValue({ id: mockProfileId, type: 'comercio' });
      prisma.inventoryItem.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.create.mockResolvedValue({
        id: mockItemId,
        ...mockDto,
        profileId: mockProfileId,
        currentStock: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createItem(mockProfileId, mockUserId, mockDto);

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
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId, type: 'comercio' });
      prisma.profile.findUnique.mockResolvedValue({ id: mockProfileId, type: 'comercio' });
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

      const result = await service.createItem(mockProfileId, mockUserId, dtoSinStock);

      expect(result.currentStock).toBe(0);
    });

    it('debe rechazar si el perfil no es tipo comercio', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId, type: 'familiar' });
      prisma.profile.findUnique.mockResolvedValue({ id: mockProfileId, type: 'familiar' });

      await expect(service.createItem(mockProfileId, mockUserId, mockDto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('debe rechazar SKU duplicado en el mismo perfil', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId, type: 'comercio' });
      prisma.profile.findUnique.mockResolvedValue({ id: mockProfileId, type: 'comercio' });
      prisma.inventoryItem.findUnique.mockResolvedValue({ id: 'existing', sku: 'FNT-001' });

      await expect(service.createItem(mockProfileId, mockUserId, mockDto)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateItem', () => {
    const mockDto: UpdateInventoryItemDto = { name: 'Fanta Naranja 2L' };

    it('debe actualizar nombre del producto', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
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

      const result = await service.updateItem(mockProfileId, mockItemId, mockUserId, mockDto);

      expect(result.name).toBe('Fanta Naranja 2L');
    });

    it('debe rechazar cambio de SKU a uno ya existente', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        name: 'Producto A',
        sku: 'OLD-001',
        profileId: mockProfileId,
      });
      prisma.inventoryItem.findUnique.mockResolvedValue({ id: 'other', sku: 'NEW-001' });

      await expect(
        service.updateItem(mockProfileId, mockItemId, mockUserId, { sku: 'NEW-001' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('deleteItem', () => {
    it('debe eliminar producto sin stock ni movimientos', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        currentStock: 0,
        movements: [],
        profileId: mockProfileId,
      });
      prisma.inventoryItem.delete.mockResolvedValue({});

      await service.deleteItem(mockProfileId, mockItemId, mockUserId);

      expect(prisma.inventoryItem.delete).toHaveBeenCalledWith({ where: { id: mockItemId } });
    });

    it('debe rechazar eliminar producto con movimientos', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        currentStock: 0,
        movements: [{ id: 'mov-001' }],
        profileId: mockProfileId,
      });

      await expect(service.deleteItem(mockProfileId, mockItemId, mockUserId)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.inventoryItem.delete).not.toHaveBeenCalled();
    });

    it('debe rechazar eliminar producto con stock > 0', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        currentStock: 10,
        movements: [],
        profileId: mockProfileId,
      });

      await expect(service.deleteItem(mockProfileId, mockItemId, mockUserId)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listLowStock', () => {
    it('debe listar productos con stock igual o menor al mínimo', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findMany.mockResolvedValue([
        { id: 'i1', name: 'Coca-Cola', currentStock: 5, minStock: 10, profileId: mockProfileId, createdAt: new Date(), updatedAt: new Date() },
        { id: 'i2', name: 'Pepsi', currentStock: 3, minStock: 5, profileId: mockProfileId, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const result = await service.listLowStock(mockProfileId, mockUserId);

      expect(result).toHaveLength(2);
      expect(result.every((i) => i.isLowStock)).toBe(true);
    });
  });
});
