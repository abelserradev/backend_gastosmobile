import type { InventoryItem, StockMovement, Branch } from '@prisma/client';
import type {
  InventoryItemResponse,
  StockMovementResponse,
  StockBalanceResponse,
} from './entities/inventory-item.response';
import { MovementType } from './dto/create-movement.dto';
import {
  calculateMovementLineValue,
  parseDecimalPrice,
} from './inventory-pricing.util';

/**
 * Mappers para transformar entidades Prisma a respuestas de API.
 *
 * Patrón: Transformación de datos + cálculos derivados.
 */

/**
 * Mapea un InventoryItem Prisma a respuesta de API.
 */
export function mapInventoryItemToResponse(
  item: InventoryItem,
): InventoryItemResponse {
  return {
    id: item.id,
    profileId: item.profileId,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    minStock: item.minStock,
    currentStock: item.currentStock,
    isLowStock: item.currentStock <= item.minStock,
    salePrice: parseDecimalPrice(item.salePrice),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

/**
 * Mapea un StockMovement con sus relaciones a respuesta de API.
 */
export function mapStockMovementToResponse(
  movement: StockMovement & {
    item?: { name: string } | null;
    branch?: { name: string } | null;
    targetBranch?: { name: string } | null;
  },
): StockMovementResponse {
  const unitPrice = parseDecimalPrice(movement.unitPrice);
  return {
    id: movement.id,
    itemId: movement.itemId,
    itemName: movement.item?.name ?? '',
    type: movement.type as MovementType,
    quantity: movement.quantity,
    displayQuantity:
      movement.quantity > 0 ? `+${movement.quantity}` : `${movement.quantity}`,
    reason: movement.reason,
    branchId: movement.branchId,
    branchName: movement.branch?.name ?? null,
    targetBranchId: movement.targetBranchId,
    targetBranchName: movement.targetBranch?.name ?? null,
    unitPrice,
    lineValue: calculateMovementLineValue(movement.quantity, unitPrice),
    createdAt: movement.createdAt.toISOString(),
  };
}

/**
 * Mapea un Branch Prisma a respuesta simplificada.
 */
export function mapBranchToResponse(branch: Branch): {
  id: string;
  profileId: string;
  name: string;
  address: string | null;
  managerName: string | null;
  createdAt: string;
} {
  return {
    id: branch.id,
    profileId: branch.profileId,
    name: branch.name,
    address: branch.address,
    managerName: branch.managerName,
    createdAt: branch.createdAt.toISOString(),
  };
}
