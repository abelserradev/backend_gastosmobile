-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'ELECTRONIC', 'BS');

-- CreateEnum
CREATE TYPE "ValuationBasis" AS ENUM ('BCV', 'SELL_RATE');

-- CreateEnum
CREATE TYPE "ComparisonStatus" AS ENUM ('PENDING', 'CONVERTED');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "bcvEquivalentUsd" DECIMAL(14,2),
ADD COLUMN     "commissionPct" DECIMAL(5,2),
ADD COLUMN     "commissionUsd" DECIMAL(14,2),
ADD COLUMN     "nominalAmount" DECIMAL(16,2),
ADD COLUMN     "nominalCurrency" "CurrencyCode",
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "sellRate" DECIMAL(14,6),
ADD COLUMN     "valuationBasis" "ValuationBasis" NOT NULL DEFAULT 'BCV';

-- CreateTable
CREATE TABLE "PaymentComparison" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ComparisonStatus" NOT NULL DEFAULT 'PENDING',
    "productName" TEXT,
    "offer" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "contractVersion" TEXT NOT NULL DEFAULT 'v1',
    "bestOptionId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "expenseId" TEXT,
    "convertIdempotencyKey" TEXT,
    "convertRequestHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentComparison_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentComparison_expenseId_key" ON "PaymentComparison"("expenseId");

-- CreateIndex
CREATE INDEX "PaymentComparison_userId_status_createdAt_idx" ON "PaymentComparison"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentComparison_status_expiresAt_idx" ON "PaymentComparison"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "PaymentComparison" ADD CONSTRAINT "PaymentComparison_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentComparison" ADD CONSTRAINT "PaymentComparison_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
