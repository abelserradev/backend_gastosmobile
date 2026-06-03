-- FEAT-004: precios opcionales en inventario
ALTER TABLE "InventoryItem" ADD COLUMN "salePrice" DECIMAL(14,2);
ALTER TABLE "StockMovement" ADD COLUMN "unitPrice" DECIMAL(14,2);
