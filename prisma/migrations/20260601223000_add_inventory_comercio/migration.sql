-- FEAT-002: Perfil comercio + inventario (productos, movimientos, sucursales)

-- Nuevo valor en enum de perfiles
ALTER TYPE "ProfileType" ADD VALUE IF NOT EXISTS 'comercio';

-- Enum de movimientos de stock
CREATE TYPE "MovementType" AS ENUM (
  'PURCHASE',
  'SALE',
  'ADJUSTMENT',
  'INITIAL',
  'RETURN',
  'TRANSFER_OUT',
  'TRANSFER_IN'
);

-- Sucursales (Fase B)
CREATE TABLE "Branch" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "managerName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Branch_profileId_idx" ON "Branch"("profileId");

ALTER TABLE "Branch"
  ADD CONSTRAINT "Branch_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Productos
CREATE TABLE "InventoryItem" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'pieza',
  "minStock" INTEGER NOT NULL DEFAULT 0,
  "currentStock" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryItem_profileId_idx" ON "InventoryItem"("profileId");
CREATE UNIQUE INDEX "InventoryItem_profileId_sku_key" ON "InventoryItem"("profileId", "sku");

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Movimientos de stock
CREATE TABLE "StockMovement" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "type" "MovementType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT,
  "expenseId" TEXT,
  "branchId" TEXT,
  "targetBranchId" TEXT,
  "relatedMovementId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockMovement_itemId_createdAt_idx" ON "StockMovement"("itemId", "createdAt");
CREATE INDEX "StockMovement_branchId_idx" ON "StockMovement"("branchId");
CREATE UNIQUE INDEX "StockMovement_relatedMovementId_key" ON "StockMovement"("relatedMovementId");

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_targetBranchId_fkey"
  FOREIGN KEY ("targetBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_relatedMovementId_fkey"
  FOREIGN KEY ("relatedMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Stock por sucursal (Fase B)
CREATE TABLE "StockBalance" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockBalance_itemId_branchId_key" ON "StockBalance"("itemId", "branchId");
CREATE INDEX "StockBalance_branchId_idx" ON "StockBalance"("branchId");

ALTER TABLE "StockBalance"
  ADD CONSTRAINT "StockBalance_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockBalance"
  ADD CONSTRAINT "StockBalance_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
