import { MovementType } from './dto/create-movement.dto';
import {
  mapInventoryItemToResponse,
  mapStockMovementToResponse,
} from './inventory.mappers';

/**
 * FEAT-004 — contrato API de campos de precio en mappers.
 */
describe('inventory.mappers (FEAT-004)', () => {
  describe('mapInventoryItemToResponse', () => {
    it('debe incluir salePrice cuando el producto lo tiene', () => {
      const result = mapInventoryItemToResponse({
        id: 'item-1',
        profileId: 'prof-1',
        name: 'Refresco 2L',
        sku: null,
        unit: 'pieza',
        minStock: 0,
        currentStock: 20,
        salePrice: { toNumber: () => 2.5 },
        createdAt: new Date('2026-06-01T12:00:00Z'),
        updatedAt: new Date('2026-06-01T12:00:00Z'),
      } as never);

      expect(result.salePrice).toBe(2.5);
    });

    it('debe retornar salePrice null si el catálogo no tiene precio', () => {
      const result = mapInventoryItemToResponse({
        id: 'item-2',
        profileId: 'prof-1',
        name: 'Arroz 1kg',
        sku: null,
        unit: 'kg',
        minStock: 5,
        currentStock: 100,
        salePrice: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      expect(result.salePrice).toBeNull();
    });
  });

  describe('mapStockMovementToResponse', () => {
    it('debe incluir unitPrice y lineValue en ventas valoradas', () => {
      const result = mapStockMovementToResponse({
        id: 'mov-1',
        itemId: 'item-1',
        type: MovementType.SALE,
        quantity: -3,
        reason: 'Venta mostrador',
        unitPrice: { toNumber: () => 2.5 },
        branchId: null,
        targetBranchId: null,
        relatedMovementId: null,
        createdAt: new Date(),
        item: { name: 'Refresco 2L' },
        branch: null,
        targetBranch: null,
      } as never);

      expect(result.unitPrice).toBe(2.5);
      expect(result.lineValue).toBe(7.5);
    });

    it('debe retornar unitPrice y lineValue null en transferencias', () => {
      const result = mapStockMovementToResponse({
        id: 'mov-out',
        itemId: 'item-1',
        type: MovementType.TRANSFER_OUT,
        quantity: -40,
        reason: 'Traslado',
        unitPrice: null,
        branchId: 'b1',
        targetBranchId: 'b2',
        relatedMovementId: 'mov-in',
        createdAt: new Date(),
        item: { name: 'Arroz 1kg' },
        branch: { name: 'Central' },
        targetBranch: { name: 'Norte' },
      } as never);

      expect(result.unitPrice).toBeNull();
      expect(result.lineValue).toBeNull();
    });
  });
});
