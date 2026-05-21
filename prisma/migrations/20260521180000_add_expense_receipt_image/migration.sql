-- AlterTable: imagen de comprobante/factura adjunta al gasto
ALTER TABLE "Expense" ADD COLUMN "receiptImage" BYTEA,
ADD COLUMN "receiptMime" TEXT;
