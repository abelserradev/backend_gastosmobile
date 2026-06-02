import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StockMovementService } from './stock-movement.service';
import {
  CreateStockMovementDto,
  MovementType,
} from './dto/create-movement.dto';
import { AdjustStockDto } from './dto/create-movement.dto';

describe('StockMovementService', () => {
  let service: StockMovementService;
  let prisma: {
    profile: {
      findFirst: jest.Mock;
    };
    inventoryItem: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    stockMovement: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    stockBalance: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const mockProfileId = 'prof-001';
  const mockUserId = 'user-001';
  const mockItemId = 'item-001';
  const mockMovementId = 'mov-001';

  beforeEach(() => {
    prisma = {
      profile: {
        findFirst: jest.fn(),
      },
      inventoryItem: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      stockMovement: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      stockBalance: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    service = new StockMovementService(prisma as never);
  });

  describe('listMovements', () => {
    it('debe retornar lista de movimientos de un producto', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        profileId: mockProfileId,
      });
      prisma.stockMovement.findMany.mockResolvedValue([
        {
          id: 'm1',
          itemId: mockItemId,
          type: MovementType.PURCHASE,
          quantity: 100,
          reason: 'Compra inicial',
          item: { name: 'Coca-Cola' },
          branch: null,
          targetBranch: null,
          createdAt: new Date(),
        },
        {
          id: 'm2',
          itemId: mockItemId,
          type: MovementType.SALE,
          quantity: -5,
          reason: 'Venta cliente',
          item: { name: 'Coca-Cola' },
          branch: null,
          targetBranch: null,
          createdAt: new Date(),
        },
      ]);

      const result = await service.listMovements(
        mockProfileId,
        mockItemId,
        mockUserId,
      );

      expect(result).toHaveLength(2);
      expect(result[0].quantity).toBe(100);
      expect(result[0].displayQuantity).toBe('+100');
      expect(result[1].quantity).toBe(-5);
      expect(result[1].displayQuantity).toBe('-5');
    });

    it('debe filtrar por sucursal cuando se proporciona branchId', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        profileId: mockProfileId,
      });
      prisma.stockMovement.findMany.mockResolvedValue([]);

      await service.listMovements(
        mockProfileId,
        mockItemId,
        mockUserId,
        'branch-001',
      );

      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            itemId: mockItemId,
            branchId: 'branch-001',
          }),
        }),
      );
    });
  });

  describe('createMovement', () => {
    const mockDto: CreateStockMovementDto = {
      itemId: mockItemId,
      type: MovementType.SALE,
      quantity: 10,
      reason: 'Venta tienda',
    };

    it('debe crear movimiento de salida y actualizar stock', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        profileId: mockProfileId,
        currentStock: 50,
      });
      prisma.inventoryItem.findUnique.mockResolvedValue({ currentStock: 50 });
      prisma.stockMovement.create.mockResolvedValue({
        id: mockMovementId,
        itemId: mockItemId,
        type: MovementType.SALE,
        quantity: -10,
        reason: 'Venta tienda',
        branchId: null,
        targetBranchId: null,
        item: { name: 'Coca-Cola' },
        branch: null,
        targetBranch: null,
        createdAt: new Date(),
      });
      prisma.inventoryItem.update.mockResolvedValue({});

      const result = await service.createMovement(
        mockProfileId,
        mockUserId,
        mockDto,
      );

      expect(result.quantity).toBe(-10);
      expect(result.displayQuantity).toBe('-10');
      expect(prisma.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStock: { increment: -10 },
          }),
        }),
      );
    });

    it('debe crear movimiento de entrada (purchase) con cantidad positiva', async () => {
      const purchaseDto: CreateStockMovementDto = {
        itemId: mockItemId,
        type: MovementType.PURCHASE,
        quantity: 50,
        reason: 'Compra proveedor',
      };

      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        profileId: mockProfileId,
      });
      prisma.stockMovement.create.mockResolvedValue({
        id: mockMovementId,
        itemId: mockItemId,
        type: MovementType.PURCHASE,
        quantity: 50,
        reason: 'Compra proveedor',
        item: { name: 'Coca-Cola' },
        branch: null,
        targetBranch: null,
        createdAt: new Date(),
      });
      prisma.inventoryItem.update.mockResolvedValue({});

      const result = await service.createMovement(
        mockProfileId,
        mockUserId,
        purchaseDto,
      );

      expect(result.quantity).toBe(50);
      expect(result.displayQuantity).toBe('+50');
    });

    it('debe rechazar movimiento si resultaría en stock negativo', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        profileId: mockProfileId,
        currentStock: 5,
      });
      prisma.inventoryItem.findUnique.mockResolvedValue({ currentStock: 5 });

      const saleDto: CreateStockMovementDto = {
        itemId: mockItemId,
        type: MovementType.SALE,
        quantity: 10,
      };

      await expect(
        service.createMovement(mockProfileId, mockUserId, saleDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('debe rechazar si el producto no pertenece al perfil', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(
        service.createMovement(mockProfileId, mockUserId, mockDto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('adjustStock', () => {
    it('debe crear ajuste positivo (encontrar stock extra)', async () => {
      const adjustDto: AdjustStockDto = {
        itemId: mockItemId,
        adjustmentQty: 5,
        reason: 'Ajuste por inventario físico',
      };

      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        profileId: mockProfileId,
      });
      prisma.stockMovement.create.mockResolvedValue({
        id: mockMovementId,
        itemId: mockItemId,
        type: MovementType.ADJUSTMENT,
        quantity: 5,
        reason: 'Ajuste por inventario físico',
        item: { name: 'Coca-Cola' },
        createdAt: new Date(),
      });
      prisma.inventoryItem.update.mockResolvedValue({});

      const result = await service.adjustStock(
        mockProfileId,
        mockUserId,
        adjustDto,
      );

      expect(result.type).toBe(MovementType.ADJUSTMENT);
      expect(result.quantity).toBe(5);
    });

    it('debe crear ajuste negativo (merma) validando stock', async () => {
      const adjustDto: AdjustStockDto = {
        itemId: mockItemId,
        adjustmentQty: -3,
        reason: 'Productos dañados',
      };

      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        profileId: mockProfileId,
        currentStock: 10,
      });
      prisma.inventoryItem.findUnique.mockResolvedValue({ currentStock: 10 });
      prisma.stockMovement.create.mockResolvedValue({
        id: mockMovementId,
        itemId: mockItemId,
        type: MovementType.ADJUSTMENT,
        quantity: -3,
        reason: 'Productos dañados',
        item: { name: 'Coca-Cola' },
        createdAt: new Date(),
      });
      prisma.inventoryItem.update.mockResolvedValue({});

      const result = await service.adjustStock(
        mockProfileId,
        mockUserId,
        adjustDto,
      );

      expect(result.quantity).toBe(-3);
    });

    it('debe rechazar ajuste negativo si dejaría stock en negativo', async () => {
      const adjustDto: AdjustStockDto = {
        itemId: mockItemId,
        adjustmentQty: -20,
        reason: 'Merma excesiva',
      };

      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        profileId: mockProfileId,
      });
      prisma.inventoryItem.findUnique.mockResolvedValue({ currentStock: 10 });

      await expect(
        service.adjustStock(mockProfileId, mockUserId, adjustDto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('transferBetweenBranches', () => {
    it('debe crear par de movimientos vinculados para transferencia', async () => {
      const sourceBranchId = 'branch-centro';
      const targetBranchId = 'branch-norte';
      const transferQty = 10;

      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        profileId: mockProfileId,
      });
      prisma.stockBalance.findUnique.mockResolvedValue({ quantity: 30 });
      prisma.stockMovement.create
        .mockResolvedValueOnce({
          id: 'mov-out',
          type: MovementType.TRANSFER_OUT,
          quantity: -10,
        })
        .mockResolvedValueOnce({
          id: 'mov-in',
          type: MovementType.TRANSFER_IN,
          quantity: 10,
        });

      // Resultado del findMany final
      prisma.stockMovement.findMany.mockResolvedValue([
        {
          id: 'mov-out',
          itemId: mockItemId,
          type: MovementType.TRANSFER_OUT,
          quantity: -10,
          item: { name: 'Coca-Cola' },
          branch: { name: 'Sucursal Centro' },
          targetBranch: { name: 'Sucursal Norte' },
          createdAt: new Date(),
        },
        {
          id: 'mov-in',
          itemId: mockItemId,
          type: MovementType.TRANSFER_IN,
          quantity: 10,
          item: { name: 'Coca-Cola' },
          branch: { name: 'Sucursal Norte' },
          targetBranch: { name: 'Sucursal Centro' },
          createdAt: new Date(),
        },
      ]);

      const result = await service.transferBetweenBranches(
        mockProfileId,
        mockUserId,
        mockItemId,
        sourceBranchId,
        targetBranchId,
        transferQty,
        'Transferencia programada',
      );

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe(MovementType.TRANSFER_OUT);
      expect(result[0].quantity).toBe(-10);
      expect(result[1].type).toBe(MovementType.TRANSFER_IN);
      expect(result[1].quantity).toBe(10);
    });

    it('debe rechazar transferencia si sucursales son iguales', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        profileId: mockProfileId,
      });

      await expect(
        service.transferBetweenBranches(
          mockProfileId,
          mockUserId,
          mockItemId,
          'same-branch',
          'same-branch',
          5,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('debe rechazar transferencia si origen no tiene stock suficiente', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: mockProfileId });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        profileId: mockProfileId,
      });
      prisma.stockBalance.findUnique.mockResolvedValue({ quantity: 5 });

      await expect(
        service.transferBetweenBranches(
          mockProfileId,
          mockUserId,
          mockItemId,
          'branch-a',
          'branch-b',
          10,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('validación de ownership', () => {
    it('debe rechazar operación si el perfil no pertenece al usuario', async () => {
      prisma.profile.findFirst.mockResolvedValue(null);

      await expect(
        service.listMovements(mockProfileId, mockItemId, mockUserId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
