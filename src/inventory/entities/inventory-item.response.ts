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
  /** FEAT-004: precio de catálogo venta (opcional). */
  salePrice: number | null;
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
  /** FEAT-004: precio unitario del movimiento (null si no aplica). */
  unitPrice: number | null;
  /** FEAT-004: |quantity| × unitPrice cuando hay precio. */
  lineValue: number | null;
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

/**
 * Sucursal de un perfil comercio (FEAT-002 Fase B).
 */
export interface BranchResponse {
  id: string;
  profileId: string;
  name: string;
  address: string | null;
  managerName: string | null;
  createdAt: string;
}
