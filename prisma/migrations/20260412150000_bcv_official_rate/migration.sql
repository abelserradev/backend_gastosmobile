-- CreateTable
CREATE TABLE "BcVOfficialRate" (
    "id" TEXT NOT NULL,
    "rateDate" DATE NOT NULL,
    "vesPerUsd" DECIMAL(18,6) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BcVOfficialRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BcVOfficialRate_rateDate_key" ON "BcVOfficialRate"("rateDate");

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "paymentDate" DATE,
ADD COLUMN     "bcvRateApplied" DECIMAL(14,6),
ADD COLUMN     "bcvRateDate" DATE;
