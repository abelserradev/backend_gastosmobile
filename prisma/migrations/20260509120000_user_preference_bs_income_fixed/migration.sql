-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "incomeFixedBs" DECIMAL(14,2),
ADD COLUMN     "incomeRegisteredBcvRateId" TEXT;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_incomeRegisteredBcvRateId_fkey" FOREIGN KEY ("incomeRegisteredBcvRateId") REFERENCES "BcVOfficialRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
