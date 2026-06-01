import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryItemService } from './inventory-item.service';
import { StockMovementService } from './stock-movement.service';

/**
 * Módulo de Inventario (FEAT-002).
 *
 * Gestiona productos y movimientos de stock para perfiles tipo comercio.
 *
 * Estructura:
 * - InventoryController: endpoints REST
 * - InventoryService: orquestación y resúmenes
 * - InventoryItemService: CRUD de productos
 * - StockMovementService: registro de movimientos y cálculo de stock
 *
 * Servicios exportados para uso en otros módulos (ej: vincular gasto con entrada).
 */
@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryItemService, StockMovementService],
  exports: [InventoryService, InventoryItemService, StockMovementService],
})
export class InventoryModule {}
