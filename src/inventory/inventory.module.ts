import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryItemService } from './inventory-item.service';
import { StockMovementService } from './stock-movement.service';
import { BranchService } from './branch.service';

/**
 * Módulo de Inventario (FEAT-002).
 */
@Module({
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryItemService,
    StockMovementService,
    BranchService,
  ],
  exports: [
    InventoryService,
    InventoryItemService,
    StockMovementService,
    BranchService,
  ],
})
export class InventoryModule {}
