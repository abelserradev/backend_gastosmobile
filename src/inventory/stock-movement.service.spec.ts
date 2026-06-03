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
  let profileAccess: {
    assertInventoryAccess: jest.Mock;
  };
  let prisma: {
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
    profileAccess = {
      assertInventoryAccess: jest.fn().mockResolvedValue({
        access: 'owner',
        profile: { id: mockProfileId, type: 'comercio' },
      }),
    };
    prisma = {
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
    service = new StockMovementService(
      prisma as never,
      profileAccess as never,
    );
  });

  describe('listMovements', () => {
    it('debe retornar lista de movimientos de un producto', async () => {
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
      profileAccess.assertInventoryAccess.mockRejectedValue(
        new ForbiddenException(),
      );

      await expect(
        service.listMovements(mockProfileId, mockItemId, mockUserId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  /**
   * FEAT-004 — unitPrice opcional en movimientos.
   * Spec: Escenarios B, C, D (FEAT-inventory-pricing-optional.md).
   */
  describe('FEAT-004: unitPrice en movimientos', () => {
    beforeEach(() => {
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: mockItemId,
        profileId: mockProfileId,
        currentStock: 50,
      });
      prisma.inventoryItem.findUnique.mockResolvedValue({ currentStock: 50 });
      prisma.inventoryItem.update.mockResolvedValue({});
    });

    it('debe persistir unitPrice en venta valorada (Escenario B)', async () => {
      const saleDto: CreateStockMovementDto = {
        itemId: mockItemId,
        type: MovementType.SALE,
        quantity: 3,
        unitPrice: 2.5,
      };

      prisma.stockMovement.create.mockResolvedValue({
        id: mockMovementId,
        itemId: mockItemId,
        type: MovementType.SALE,
        quantity: -3,
        unitPrice: { toNumber: () => 2.5 },
        reason: null,
        branchId: null,
        targetBranchId: null,
        item: { name: 'Refresco 2L' },
        branch: null,
        targetBranch: null,
        createdAt: new Date(),
      });

      const result = await service.createMovement(
        mockProfileId,
        mockUserId,
        saleDto,
      );

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ unitPrice: 2.5 }),
        }),
      );
      expect(result.unitPrice).toBe(2.5);
      expect(result.lineValue).toBe(7.5);
    });

    it('debe permitir venta sin unitPrice (Escenario D)', async () => {
      const saleDto: CreateStockMovementDto = {
        itemId: mockItemId,
        type: MovementType.SALE,
        quantity: 5,
      };

      prisma.stockMovement.create.mockResolvedValue({
        id: mockMovementId,
        itemId: mockItemId,
        type: MovementType.SALE,
        quantity: -5,
        unitPrice: null,
        item: { name: 'Producto' },
        branch: null,
        targetBranch: null,
        createdAt: new Date(),
      });

      const result = await service.createMovement(
        mockProfileId,
        mockUserId,
        saleDto,
      );

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ unitPrice: null }),
        }),
      );
      expect(result.unitPrice).toBeNull();
    });

    it('debe ignorar unitPrice en TRANSFER_OUT si el cliente lo envía', async () => {
      const transferDto: CreateStockMovementDto = {
        itemId: mockItemId,
        type: MovementType.TRANSFER_OUT,
        quantity: 10,
        branchId: 'branch-a',
        targetBranchId: 'branch-b',
        unitPrice: 99,
      };

      prisma.stockBalance.findUnique.mockResolvedValue({ quantity: 30 });
      prisma.stockMovement.create.mockResolvedValue({
        id: mockMovementId,
        itemId: mockItemId,
        type: MovementType.TRANSFER_OUT,
        quantity: -10,
        unitPrice: null,
        item: { name: 'Arroz' },
        branch: null,
        targetBranch: null,
        createdAt: new Date(),
      });

      await service.createMovement(mockProfileId, mockUserId, transferDto);

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ unitPrice: null }),
        }),
      );
    });

    it('debe rechazar unitPrice negativo', async () => {
      const saleDto: CreateStockMovementDto = {
        itemId: mockItemId,
        type: MovementType.SALE,
        quantity: 1,
        unitPrice: -0.5,
      };

      await expect(
        service.createMovement(mockProfileId, mockUserId, saleDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('transferBetweenBranches no debe persistir unitPrice (Escenario C)', async () => {
      prisma.stockBalance.findUnique.mockResolvedValue({ quantity: 100 });
      prisma.stockMovement.create
        .mockResolvedValueOnce({ id: 'mov-out', type: MovementType.TRANSFER_OUT })
        .mockResolvedValueOnce({ id: 'mov-in', type: MovementType.TRANSFER_IN });
      prisma.stockMovement.findMany.mockResolvedValue([
        {
          id: 'mov-out',
          itemId: mockItemId,
          type: MovementType.TRANSFER_OUT,
          quantity: -40,
          unitPrice: null,
          item: { name: 'Arroz 1kg' },
          branch: { name: 'Central' },
          targetBranch: { name: 'Norte' },
          createdAt: new Date(),
        },
        {
          id: 'mov-in',
          itemId: mockItemId,
          type: MovementType.TRANSFER_IN,
          quantity: 40,
          unitPrice: null,
          item: { name: 'Arroz 1kg' },
          branch: { name: 'Norte' },
          targetBranch: { name: 'Central' },
          createdAt: new Date(),
        },
      ]);

      const result = await service.transferBetweenBranches(
        mockProfileId,
        mockUserId,
        mockItemId,
        'branch-central',
        'branch-norte',
        40,
      );

      const createCalls = prisma.stockMovement.create.mock.calls as Array<
        [{ data: { unitPrice?: unknown } }]
      >;
      expect(createCalls.every((call) => call[0].data.unitPrice == null)).toBe(
        true,
      );
      expect(result.every((m) => m.unitPrice == null)).toBe(true);
    });
  });
});
