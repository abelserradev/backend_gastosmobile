import { MovementType } from '../dto/create-movement.dto';

/**
 * Respuesta de un producto en inventario.
 */
export interface InventoryItemResponse {
  id: string;
  profileId: string;
  name: string;
  sku: string | null;
  unit: string;
  minStock: number;
  currentStock: number;
  isLowStock: boolean; // calculado: currentStock <= minStock
  createdAt: string;
  updatedAt: string;
}

/**
 * Respuesta de un movimiento de stock.
 */
export interface StockMovementResponse {
  id: string;
  itemId: string;
  itemName: string;
  type: MovementType;
  quantity: number;
  displayQuantity: string; // "+10" o "-5" para UI
  reason: string | null;
  branchId: string | null;
  branchName: string | null;
  targetBranchId: string | null;
  targetBranchName: string | null;
  createdAt: string;
}

/**
 * Respuesta de stock por sucursal (Fase B).
 */
export interface StockBalanceResponse {
  branchId: string;
  branchName: string;
  quantity: number;
  updatedAt: string;
}

/**
 * Resumen de inventario para dashboard.
 */
export interface InventorySummaryResponse {
  totalItems: number;
  lowStockCount: number;
  totalStockValue: number; // Fase C: valor estimado del inventario
  lastMovementAt: string | null;
}
